const rule = {
    json: {match: [], rewrite: []},
    async load() {
        const {rule} = await browser.storage.local.get('rule')
        Object.assign(this.json, rule)
    },
    async loadToPage() {
        await this.load()
        document.getElementsByName('match-regexp')[0].value =
            this.json.match.map(rule => rule.regexp).join('\n')
        document.getElementsByName('rewrite-regexp')[0].value = 
            this.json.rewrite.map(rule => rule.regexp).join('\n')
        document.getElementsByName('rewrite-replacement')[0].value =
            this.json.rewrite.map(rule => rule.replacement).join('\n')
    },
    read() {
        this.json.match = document.getElementsByName('match-regexp')[0]
            .value.trim().split(/\n/g).map(regexp => ({regexp}))
        const rewriteRegexp = document.getElementsByName('rewrite-regexp')[0]
              .value.trim().split(/\n/g)
        const rewriteReplacement = document
            .getElementsByName('rewrite-replacement')[0]
            .value.trim().split(/\n/g)
        this.json.rewrite = rewriteRegexp.map(
            (regexp, i) => ({regexp, replacement: rewriteReplacement[i]})
        )
    },
    async save() {
        await browser.storage.local.set({rule: this.json})
    },
    async readSaveUpdate() {
        this.read()
        await this.save()
        await this.update()
    },
    async update() {
        await browser.runtime.sendMessage({
            type: 'update-rule'
        })
    }
}
const historyMaster = {
    clearHistory() {
        while (this.table.children[1]) {
            this.table.children[1].remove()
        }
    },
    showHistory(entry) {
        for (const row of this.entryToNode(entry)) {
            this.table.appendChild(row)
        }
    },
    *entryToNode(entry) {
        const deep = true
        const template = this.entryRow.cloneNode(deep)
        template.children[1].textContent = entry.title
        template.children[2].textContent = entry.url
        for (const date of entry.dateList) {
            const node = template.cloneNode(deep)
            const local = this.dateToTimezoneIsoString(date)
            node.children[0].textContent = local
            yield node
        }
    },
    dateToTimezoneIsoString(date) {
        const local = new Date(date)
        const offset = local.getTimezoneOffset()
        local.setMinutes(local.getMinutes() - offset)

        const offsetHour = -offset / 60
        let offsetString = ''
        if (offsetHour >= 10) offsetString = '+' + offsetHour
        else if (offsetHour >= 0) offsetString = '+0' + offsetHour
        else if (offsetHour >= -9) offsetString = '-0' + (-offsetHour)
        else offsetString = String(offsetHour)
        offsetString += ':00'
        return local.toISOString().replace('Z', offsetString)
    },
    table: document.querySelector('table'),
    searchInputLast: null,
    searchInputTimeout: lib.inputDebounceSecond,
    async handleSearchInputDebounce(input) {
        const searchString = input.target.value.trim()
        if (!searchString) return

        const current = Date.now()
        this.searchInputLast = current
        await lib.sleep(this.searchInputTimeout)
        if (this.searchInputLast != current) return

        const keywordList = searchString.split(/\s+/g)
        const response = await browser.runtime.sendMessage({
            type: 'search-history', keywordList
        })
        this.clearHistory()
        const port = browser.runtime.connect({name: response.portName})
        port.onMessage.addListener(entry => this.showHistory(entry))
        await new Promise(resolve => {
            port.onDisconnect.addListener(resolve)
        })
    },
    async handleHistoryCount(
        output = document.getElementsByName('history-record-count')[0]
    ) {
        const response = await browser.runtime.sendMessage({
            type: 'count-history'
        })
        output.textContent = response.count
    },
    async handleHistoryDownload() {
        const response = await browser.runtime.sendMessage({
            type: 'extract-history'
        })
        const anchor = document.createElement('a')
        anchor.href = response.url
        const date = new Date()
        const dateString = date.toISOString().slice(0, 10)
        anchor.setAttribute('download', `history-gateway-${dateString}.txt`)
        document.body.appendChild(anchor)
        anchor.click()
        await lib.sleep(lib.inputDebounceSecond)
        anchor.remove()
        URL.revokeObjectURL(response.url)
    },
    async handleHistoryClear() {
        await browser.runtime.sendMessage({type: 'clear-history'})
        await this.handleHistoryCount()
    }
}
historyMaster.entryRow = document.createElement('tr')
historyMaster.entryRow.innerHTML = '<tr><td><td><td>'

rule.loadToPage()
document.getElementsByName('save-rule')[0].onclick =
    () => rule.readSaveUpdate()
document.getElementsByName('download-history')[0].onclick =
    input => historyMaster.handleHistoryDownload()
document.getElementsByName('search-history')[0].oninput =
    input => historyMaster.handleSearchInputDebounce(input)
document.getElementsByName('clear-history')[0].onclick =
    () => historyMaster.handleHistoryClear()
historyMaster.handleHistoryCount()

