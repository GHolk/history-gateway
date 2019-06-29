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
    }
}
rule.loadToPage()
document.getElementsByName('save-rule')[0].onclick =
    () => rule.readSaveUpdate()
