/* global Promise, web3 */

const accounts = require("../accounts.json");

async function assertSolidityThrow(f, message) {
    try {
        await f();
    } catch (e) {
        if (/invalid opcode/.test(e.message)) {
            return;
        }
    }
    throw new Error(message);
}

function solidityEventPromise(eventSource, timeout=1000) {
    return new Promise((resolve, reject) => {
        let stopped = false;
        const filter = eventSource.watch((err, event) => {
            if (err) {
                reject(err);
            } else {
                resolve(event);
            }
            if (!stopped) {
                filter.stopWatching();
                stopped = true;
            }
        });

        // If no timeout is set and the event is missed, the test will run forever
        if (timeout !== 0) {
            setTimeout(() => {
                if (!stopped) {
                    filter.stopWatching();
                    stopped = true;
                    reject(new Error("event timeout"));
                }
            }, timeout);
        }
        return filter;
    });
}

async function jsonRpc(method, ...params) {
    return new Promise((resolve, reject) => {
        return web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method,
            params,
            id: Math.floor(Math.random() * 0xFFFFFFFF)
        }, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

async function testrpcIncreaseTime(seconds) {
    await jsonRpc("evm_increaseTime", seconds);
    await jsonRpc("evm_mine");
    return web3.eth.getBlock(web3.eth.blockNumber).timestamp;
}

async function setBalance(addr, balance) {
    const origBalance = web3.eth.getBalance(addr);
    if (origBalance.gt(balance)) {
        const toSend = origBalance.sub(balance);
        await web3.eth.sendTransaction({
            from: addr,
            to: accounts[accounts.length - 1].address,
            value: toSend,
            gasPrice: 0
        });
    } else {
        const toSend = balance.sub(origBalance);
        await web3.eth.sendTransaction({
            from: accounts[accounts.length - 1].address,
            to: addr,
            value: toSend,
            gasPrice: 0
        });
    }
}

module.exports = {
    assertSolidityThrow,
    solidityEventPromise,
    testrpcIncreaseTime,
    setBalance
};
