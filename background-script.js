const historyStorage = {
    name: 'history-gateway',
    version: 4,
    store: 'history-set',
    async initIndexDb() {
        const request = indexedDB.open(this.name, this.version)
        const defer = lib.defer()
        request.onupgradeneeded = this.handleIndexDbUpgrade.bind(this)
        request.onsuccess = open => {
            this.indexDb = open.target.result
            defer.resolve()
        }
        request.onerror = defer.reject
        await defer.promise
    },
    handleIndexDbUpgrade(upgrade) {
        const indexDb = upgrade.target.result
        const tx = upgrade.target.transaction
        console.debug('old version: ' + upgrade.oldVersion)
        console.debug('object store: ' + tx.objectStoreNames[0])
        let store
        if (upgrade.oldVersion < 2) {
            console.debug('new object store')
            store = indexDb.createObjectStore('history-set', {keyPath: 'url'})
        }
        else store = tx.objectStore(this.store)
        if (upgrade.oldVersion < 3) {
            console.debug('add index dateList')
            store.createIndex('dateList', 'dateList', {multiEntry: true})
        }
        if (upgrade.oldVersion < 4) {
            console.debug('add index dateLast')
            store.createIndex('dateLast', 'dateLast')
            const request = store.openCursor()
            request.onsuccess = open => {
                const cursor = open.target.result
                if (cursor) {
                    const entry = cursor.value
                    entry.dateLast = entry.dateList[entry.dateList.length-1]
                    const update = cursor.update(entry)
                    update.onsuccess = () => cursor.continue()
                }
            }
        }
    },
    async addHistory(entry) {
        const tx = this.createTransaction(this.store, 'readwrite')
        const existEntry = await this.getHistory(entry, tx)
        const store = tx.objectStore(this.store)
        if (existEntry) {
            existEntry.title = entry.title
            existEntry.dateList.push(entry.date)
            existEntry.dateLast = entry.date
            store.put(existEntry)
        }
        else {
            const copyEntry = {}
            copyEntry.url = entry.url
            copyEntry.title = entry.title
            copyEntry.dateList = [entry.date]
            copyEntry.dateLast = entry.date
            store.add(copyEntry)
        }
        const defer = lib.defer()
        tx.oncomplete = defer.resolve
        tx.onerror = defer.reject
        await defer.promise
    },
    createTransaction(store = this.store, type = 'readonly') {
        return this.indexDb.transaction(store, type)
    },
    async getHistory(entry, tx = this.createTransaction()) {
        const store = tx.objectStore(this.store)
        const request = store.get(entry.url)
        const defer = lib.defer()
        request.onsuccess = defer.resolve
        request.onerror = defer.reject
        await defer.promise
        return request.result
    },
    async getExtractHistory(callback, tx = this.createTransaction()) {
        const store = tx.objectStore(this.store)
        const defer = lib.defer()

        const range = IDBKeyRange.lowerBound(0) // match anything
        const direction = 'prev' // from max to min
        const request = store.index('dateLast').openCursor(range, direction)
        request.onsuccess = open => {
            const cursor = open.target.result
            if (cursor) {
                callback(cursor.value)
                cursor.continue()
            }
            else defer.resolve()
        }
        request.onerror = defer.reject
        return await defer.promise
    },
    async clearHistory() {
        const tx = this.createTransaction(this.store, 'readwrite')
        const store = tx.objectStore(this.store)
        const request = store.clear()
        const defer = lib.defer()
        request.onsuccess = defer.resolve
        return await defer.promise
    },
    async countRecordNumber() {
        const tx = this.createTransaction()
        const store = tx.objectStore(this.store)
        const request = store.count()
        const defer = lib.defer()
        request.onsuccess = () => defer.resolve({count: request.result})
        return await defer.promise
    }
}

const historyController = {
    inject({historyApi, historyStorage}) {
        Object.assign(this, {historyApi, historyStorage})
    },
    async handleHistory(item) {
        console.debug('visit url: ', item.url)
        if (this.match(item.url)) {
            console.debug('match url: ', item.url)
            const rewriteUrl = this.rewrite(item.url)
            await this.historyStorage.addHistory({
                url: rewriteUrl,
                title: item.title,
                date: item.lastVisitTime || item.visitTime || Date.now()
            })
            await this.historyApi.deleteUrl({url: item.url})
        }
    },
    rewrite(url) {
        for (const rule of this.rewriteRule) {
            if (rule.regexp.test(url)) {
                return url.replace(rule.regexp, rule.replacement)
            }
        }
        return url
    },
    rewriteRule: [],
    match(url) {
        for (const rule of this.matchRule) {
            if (rule.regexp.test(url)) return true
        }
        return false
    },
    matchRule: [],
    async loadFromStorage(storage = browser.storage.local) {
        const {rule} = await storage.get('rule')
        this.load(rule)
    },
    load(rule) {
        if (!rule) return
        this.rewriteRule = rule.rewrite.map(rule => ({
            regexp: new RegExp(rule.regexp, 'i'),
            replacement: rule.replacement
        }))
        this.matchRule = rule.match.map(rule => ({
            regexp: new RegExp(rule.regexp, 'i')
        }))
    },
    async searchHistory(keywordList, callback) {
        const regexpList = keywordList.map(string => new RegExp(string, 'i'))
        await this.historyStorage.getExtractHistory(entry => {
            if (regexpList.every(regexp => regexp.test(entry.title) ||
                                           regexp.test(entry.url))) {
                callback(entry)
            }
        })
    },
    async extractHistory() {
        const list = []
        await this.historyStorage.getExtractHistory(entry => list.push(
            entry.url + '\t' +
                encodeURIComponent(entry.title) + '\t' +
                entry.dateList.join('\t')
        ))
        const blob = new Blob([list.join('\n')])
        return {url: URL.createObjectURL(blob)}
    },
    async handleMessage(message) {
        switch (message.type) {
        case 'update-rule':
            await this.loadFromStorage()
            break
        case 'search-history':
            const keywordList = message.keywordList
            const portName = 'search-history-' + String(Math.random()).slice(2)
            const portConnect = lib.waitPort(port => port.name == portName)
            portConnect.then(async port => {
                await this.searchHistory(
                    keywordList,
                    entry => port.postMessage(entry)
                )
                port.disconnect()
            })
            return {portName}
            break
        case 'extract-history':
            return await this.extractHistory()
        case 'count-history':
            return await this.historyStorage.countRecordNumber()
        case 'clear-history':
            return await this.historyStorage.clearHistory()
        default:
            throw new Error('unknown message type: ', message.type)
        }
    },
    handleOmniboxEnter(url, target) {
        try {
            new URL(url)
        }
        catch (invalidUrl) {
            url = 'control-panel.html'
        }
        switch (target) {
        case 'currentTab':
            browser.tabs.update({url})
            break
        case 'newForegroundTab':
            browser.tabs.create({url})
            break
        case 'newBackgroundTab':
            browser.tabs.create({url, active: false})
            break
        }
    },
    omniboxChangeLast: null,
    omniboxChangeTimeout: lib.inputDebounceSecond,
    async handleOmniboxChangeDebounce(searchString, suggest) {
        searchString = searchString.trim()
        if (!searchString) return

        const current = Date.now()
        this.omniboxChangeLast = current
        await lib.sleep(this.omniboxChangeTimeout)
        if (this.omniboxChangeLast != current) {
            return
        }

        const keywordList = searchString.split(/\s+/g)
        const recorder = this.suggestRecorder.create(list => {
            if (list.length == 0) {
                suggest([{
                    content: 'about:blank',
                    description: 'nothing found'
                }])
            }
            else suggest(list)
        })
        await this.searchHistory(
            keywordList,
            entry => recorder.add(entry)
        )
        if (recorder.list.length < recorder.maxLength) {
            recorder.suggest()
        }
    },
    suggestRecorder: {
        create(callback) {
            const child = Object.create(this)
            child.list = []
            child.suggestCallback = callback
            return child
        },
        maxLength: 6,
        suggestCallback: null,
        suggest() {
            this.suggestCallback(this.list)
        },
        list: null,
        entryExist(entry) {
            return this.list.find(item => item.content == entry.url)
        },
        full: false,
        add(entry) {
            if (!this.full && !this.entryExist(entry)) {
                this.list.push({
                    content: entry.url,
                    description: entry.title
                })
                if (this.list.length == this.maxLength) {
                    this.full = true
                    this.suggest()
                    return
                }
            }
        }
    }
}


historyController.inject({historyApi: browser.history, historyStorage})
historyController.loadFromStorage()
historyController.historyStorage.initIndexDb().then(() => {
    historyController.historyApi.onTitleChanged.addListener(
        item => historyController.handleHistory(item)
    )
    browser.runtime.onMessage.addListener(
        message => historyController.handleMessage(message)
    )
    browser.omnibox.onInputChanged.addListener((text, suggest) => {
        historyController.handleOmniboxChangeDebounce(text, suggest)
    })
    browser.omnibox.onInputEntered.addListener(
        historyController.handleOmniboxEnter
    )
})

