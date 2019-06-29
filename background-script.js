
const history = browser.history
const storage = browser.storage.local
// const indexedDB = window.indexedDB

initHistorySave(storage)

const regexp = /^https?:..nhentai.net.g.\d+.\d*[13579].*$/

history.onVisited.addListener(item => {
    if (!item.title) return
    if (regexp.test(item.url)) {
        console.log("detect", item.title, item.url)
        saveHistory(storage, item)
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
        const request = indexedDB.open(this.name)
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
    async addHistory(entry, tx = this.createTransaction()) {
        const existEntry = await this.getHistory(entry)
        const store = tx.objectStore(this.store)
        if (existEntry) {
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
    createTransaction(store = this.store, type = 'read') {
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
    defer() {
        const defer = {}
        defer.promise = new Promise((resolve, reject) => {
            defer.resolve = resolve
            defer.reject = reject
        })
        return defer
    }
}

async function initHistorySave(storage) {
    let {'history-length': length} = await storage.get('history-length')
    if (typeof length != 'number') length = 0
    await storage.set({'history-length': length})
    console.log(length)
}
async function saveHistory(storage, item) {
    let {'history-length': length} = await storage.get('history-length')
    console.log(length)
    length += 1
    const itemKey = `history-item-${length}`
    await storage.set({
        [itemKey]: {url: item.url, title: item.title},
        'history-length': length
    })
}
