/* eslint-env mocha, node */
/* global artifacts, contract, assert, Promise */

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

const LikeCoin = artifacts.require("./LikeCoin.sol");

// The number `100000000000000` is set in the deploy script `migrations/2_deploy_likecoin.js`
const initialAmount = 100000000000000;

contract("LikeCoin", (accounts) => {
    it(`should put ${initialAmount} units of coins in accounts[0]`, async () => {
        const like = await LikeCoin.deployed();
        const balance = await like.balanceOf(accounts[0]);
        assert.equal(balance.valueOf(), initialAmount, `${initialAmount} units of coins should be put in account[0]`);
    });

    const transferAmount = 314;
    it(`should transfer ${transferAmount} units of coins from accounts[0] to accounts[1]`, async () => {
        const like = await LikeCoin.deployed();
        const startingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const startingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const endingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const endingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(endingBalance0, startingBalance0 - transferAmount, "Sender's balance wasn't correctly changed");
        assert.equal(endingBalance1, startingBalance1 + transferAmount, "Receiver's balance wasn't correctly changed");
    });

    it("should forbid accounts[0] to transfer more coins than it owned", async () => {
        const like = await LikeCoin.deployed();
        const balance0 = (await like.balanceOf(accounts[0])).toNumber();
        const balance2 = (await like.balanceOf(accounts[2])).toNumber();
        await assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance0 + 1, {from: accounts[0]});
        }, "Sending more than owned should be forbidden");
        await assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance2 + 1, {from: accounts[2]});
        }, "Sending more than owned should be forbidden");
    });

    const allowance = 10000;
    it(`should allow accounts[1] to transfer at most ${allowance} units of coins from accounts[0] to accounts[2]`, async () => {
        const like = await LikeCoin.deployed();
        const startingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const startingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        const startingBalance2 = (await like.balanceOf(accounts[2])).toNumber();
        await like.approve(accounts[1], allowance, {from: accounts[0]});
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1])).toNumber();
        assert.equal(allowanceOf1On0, allowance, "Allowance wasn't correctly set");
        await like.transferFrom(accounts[0], accounts[2], transferAmount, {from: accounts[1]});
        const endingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const endingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        const endingBalance2 = (await like.balanceOf(accounts[2])).toNumber();
        assert.equal(endingBalance0, startingBalance0 - transferAmount, "Sender's balance wasn't correctly changed");
        assert.equal(endingBalance1, startingBalance1, "Caller's balance should not be changed");
        assert.equal(endingBalance2, startingBalance2 + transferAmount, "Receiver's balance wasn't correctly changed");
        const allowanceOf1On0After = (await like.allowance(accounts[0], accounts[1])).toNumber();
        assert.equal(allowanceOf1On0After, allowance - transferAmount, "Allowance wasn't correctly changed");
    });

    it("should forbid unapproved transferFrom", async () => {
        const like = await LikeCoin.deployed();
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1])).toNumber();
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[2], accounts[0], allowanceOf1On0, {from: accounts[1]});
        }, "transferFrom with invalid owner should be forbidden");
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0, {from: accounts[2]});
        }, "transferFrom with invalid spender should be forbidden");
    });

    it("should forbid transferFrom more than allowance value", async () => {
        const like = await LikeCoin.deployed();
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1])).toNumber();
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0 + 1, {from: accounts[1]});
        }, "transferFrom exceeding allowance should be forbidden");
    });
});

contract("LikeCoinEvents", (accounts) => {
    const transferAmount = 271;
    it("should emit Transfer event after transaction", async () => {
        const like = await LikeCoin.deployed();
        await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const event = await solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert.equal(event.args._value, transferAmount, "Transfer event has wrong value on field '_value'");
    });

    const allowance = 10000;
    it(`should emit Approval event after approve`, async () => {
        const like = await LikeCoin.deployed();
        await like.approve(accounts[1], allowance, {from: accounts[0]});
        const approvalEvent = await solidityEventPromise(like.Approval());
        assert.equal(approvalEvent.args._owner, accounts[0], "Approval event has wrong value on field '_owner'");
        assert.equal(approvalEvent.args._spender, accounts[1], "Approval event has wrong value on field '_spender'");
        assert.equal(approvalEvent.args._value, allowance, "Approval event has wrong value on field '_value'");
    });
});
