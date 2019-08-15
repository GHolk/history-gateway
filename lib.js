
const lib = {
    inputDebounceSecond: 1,
    async waitEvent(target, test) {
        const defer = this.defer()
        const handler = message => {
            if (test(message)) defer.resolve(message)
        }
        target.addListener(handler)
        const message = await defer.promise
        target.removeListener(handler)
        return message
    },
    defer() {
        const defer = {}
        defer.promise = new Promise((resolve, reject) => {
            defer.resolve = resolve
            defer.reject = reject
        })
        return defer
    },
    sleep(second) {
        return new Promise(wake => setTimeout(wake, second * 1000))
    },
    async waitPort(test) {
        return await this.waitEvent(
            browser.runtime.onConnect,
            test
        )
    },
    async waitMessageUntil(target, todo, end) {
        let waitResult
        const result = await new Promise(resolve => {
            waitResult = event => {
                todo(event)
                const test = end(event)
                if (test) resolve(test)
            }
            target.addListener(waitResult)
        })
        target.removeListener(waitResult)
        return result
    }
}
