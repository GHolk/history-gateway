const historyStorage = {
    name: 'history-gateway',
    version: 2,
    store: 'history-set',
    handleIndexDbError(error) {
        console.error("history indexdb error: ", error)
    },
    async initIndexDb() {
        const request = indexedDB.open(this.name, this.version)
        const defer = this.defer()
        request.onupgradeneeded = this.handleIndexDbInitStructure
        request.onsuccess = open => {
            this.indexDb = open.target.result
            this.indexDb.onerror = this.handleIndexDbError
            defer.resolve()
        }
        request.onerror = defer.reject
        await defer.promise
    },
    handleIndexDbInitStructure(upgrade) {
        const indexDb = upgrade.target.result
        indexDb.createObjectStore('history-set', {keyPath: 'url'})
    },
    async addHistory(entry) {
        const tx = this.createTransaction(this.store, 'readwrite')
        const existEntry = await this.getHistory(entry, tx)
        const store = tx.objectStore(this.store)
        if (existEntry) {
            existEntry.title = entry.title
            existEntry.dateList.push(entry.date)
            store.put(existEntry)
        }
        else {
            const copyEntry = {}
            copyEntry.url = entry.url
            copyEntry.title = entry.title
            copyEntry.dateList = [entry.date]
            store.add(copyEntry)
        }
        const defer = this.defer()
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
        const defer = this.defer()
        request.onsuccess = defer.resolve
        request.onerror = defer.reject
        await defer.promise
        return request.result
    },
    async getExtractHistory(callback, tx = this.createTransaction()) {
        const store = tx.objectStore(this.store)
        const defer = this.defer()
        const request = store.openCursor()
        request.onsuccess = open => {
            const cursor = open.target.result
            if (cursor) {
                callback(cursor.value)
                cursor.continue()
            }
            else defer.resolve()
        }
        request.onerror = defer.reject
        return defer.promise
    },
    defer() {
        const defer = {}
        defer.promise = new Promise((resolve, reject) => {
            defer.resolve = resolve
            defer.reject = reject
        })
        return defer
    }
}

const historyController = {
    inject({historyApi, historyStorage}) {
        Object.assign(this, {historyApi, historyStorage})
    },
    handleHistory(item) {
        console.log('new url: ', item.url)
        if (this.match(item.url)) {
            console.log('detect url: ', item.url)
            this.historyApi.deleteUrl({url: item.url})
            const rewriteUrl = this.rewrite(item.url)
            this.historyStorage.addHistory({
                url: rewriteUrl,
                title: item.title,
                date: item.lastVisitTime || item.visitTime || Date.now()
            })
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
        this.rewriteRule = rule.rewrite.map(rule => ({
            regexp: new RegExp(rule.regexp, 'i'),
            replacement: rule.replacement
        }))
        this.matchRule = rule.match.map(rule => ({
            regexp: new RegExp(rule.regexp, 'i')
        }))
    },
    async searchHistory(keywordList) {
        await browser.runtime.sendMessage({type: 'history-list'})
        const regexpList = keywordList.map(string => new RegExp(string, 'i'))
        await this.historyStorage.getExtractHistory(entry => {
            if (regexpList.some(regexp => regexp.test(entry.title) ||
                                          regexp.test(entry.url))) {
                browser.runtime.sendMessage({type: 'history-entry', entry})
            }
        })
    },
    async handleMessage(message) {
        switch (message.type) {
        case 'update-rule':
            await this.loadFromStorage()
            break
        case 'search-history':
            const keywordList = message.keywordList
            await this.searchHistory(keywordList)
            break
        case 'extract-history':
            await browser.runtime.sendMessage({type: 'history-list'})
            this.historyStorage.getExtractHistory(entry => {
                browser.runtime.sendMessage({type: 'history-entry', entry})
            })
            break
        default:
            console.error('unknown message type: ', message.type)
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
})
