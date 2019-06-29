
const history = browser.history

const regexp = /^https?:..nhentai.net[/]g[/]\d+[/]\d*[13579].*$/

history.onTitleChanged.addListener(item => {
    if (regexp.test(item.url)) {
        console.log("detect", item.title, item.url)
        historyStorage.addHistory({
            url: item.url,
            title: item.title,
            date: item.lastVisitTime
        })
        history.deleteUrl({url: item.url})
    }
})

history.onVisitRemoved.addListener(item => {
    console.log("delete", item, item.url)
})


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

historyStorage.initIndexDb()
