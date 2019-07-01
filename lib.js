
const lib = {
    async waitEvent(target, test) {
        let handler
        const message = await new Promise(resolve => {
            handler = message => {
                if (test(message)) resolve(message)
            }
            target.addListener(handler)
        })
        target.removeListener(handler)
        return message
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
