//    Copyright (C) 2017 LikeCoin Foundation Limited
//
//    This file is part of LikeCoin Smart Contract.
//
//    LikeCoin Smart Contract is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    LikeCoin Smart Contract is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with LikeCoin Smart Contract.  If not, see <http://www.gnu.org/licenses/>.

/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const coinsToCoinUnits = utils.coinsToCoinUnits;
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const TransferAndCallReceiverMock = artifacts.require("./TransferAndCallReceiverMock.sol");
const web3Utils = require("web3-utils");
const AccountLib = require("eth-lib/lib/account");
const Accounts = require("./accounts.json");

function signTransferAndCallDelegated(likeAddr, to, value, data, maxReward, nonce, privKey) {
    const signData = [
        { type: "address", name: "contract", value: likeAddr },
        { type: "string", name: "method", value: "transferAndCallDelegated" },
        { type: "address", name: "to", value: to },
        { type: "uint256", name: "value", value: value },
        { type: "bytes", name: "data", value: data },
        { type: "uint256", name: "maxReward", value: maxReward },
        { type: "uint256", name: "nonce", value: nonce }
    ];
    const paramSignatures = signData.map((item) => ({type: "string", value: `${item.type} ${item.name}`}));
    const params = signData.map((item) => ({type: item.type, value: item.value}));
    const hash = web3Utils.soliditySha3(
        {type: "bytes32", value: web3Utils.soliditySha3(...paramSignatures)},
        {type: "bytes32", value: web3Utils.soliditySha3(...params)},
    );
    return AccountLib.sign(hash, privKey);
}

contract("LikeCoin", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    const airdropMax = initialAmount.div(10);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount);
    });

    it(`should deploy LikeCoin contract correctly`, async () => {
        assert((await like.totalSupply()).eq(initialAmount), "Wrong initial supply");
        assert((await like.balanceOf(accounts[0])).eq(initialAmount), "Wrong balance");
        assert.equal(await like.owner(), accounts[0], "Wrong owner");
    });

    it(`should airdrop coins into accounts`, async () => {
        const balanceBefore = await like.balanceOf(accounts[0]);
        await like.transferMultiple([accounts[1], accounts[2], accounts[3]], airdropMax, {from: accounts[0]});
        assert((await like.balanceOf(accounts[1])).eq(airdropMax), `accounts[1] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[2])).eq(airdropMax), `accounts[2] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[3])).eq(airdropMax), `accounts[3] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[0])).eq(balanceBefore.sub(airdropMax.times(3))), `Wrong balance after airdrop`);
    });

    it(`should forbid airdroping coins more than remaining`, async () => {
        const remaining = await like.balanceOf(accounts[0]);
        const airdropAmount = remaining.div(8).floor().add(1);
        assert(airdropAmount.times(8).gt(remaining), "Total airdrop amount is less than remaining, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferMultiple([accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7]], airdropAmount, {from: accounts[0]});
        }, "Airdroping more than remaining should be forbidden");
    });

    it(`should allow airdroping exactly all the remaining LIKE`, async () => {
        const remaining = await like.balanceOf(accounts[0]);
        const airdropAmount = remaining.div(8).floor();
        assert(airdropAmount.times(8).eq(remaining), "Total airdrop amount does not equal to remaining, please check test case");
        await like.transferMultiple([accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8]], airdropAmount, {from: accounts[0]});
        assert((await like.balanceOf(accounts[0])).eq(0), "Still have some LIKE remaining, please check test case");
    });

    const transferAmount = 314;
    it(`should transfer ${transferAmount} units of coins from accounts[1] to accounts[2]`, async () => {
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        await like.transfer(accounts[2], transferAmount, {from: accounts[1]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        assert(endingBalance1.eq(startingBalance1.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2.add(transferAmount)), "Receiver's balance wasn't correctly changed");
    });

    it("should forbid accounts[1] to transfer more coins than it owned", async () => {
        const balance0 = (await like.balanceOf(accounts[1]));
        const balance2 = (await like.balanceOf(accounts[3]));
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance0.add(1), {from: accounts[1]});
        }, "Sending more than owned should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance2.add(1), {from: accounts[3]});
        }, "Sending more than owned should be forbidden");
    });

    let nonce = 0;

    it(`should allow others to do delegated transfer with signature`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = maxReward.sub(1);
        const value = (await like.balanceOf(accounts[2])).sub(claimedReward);
        nonce += 1;
        assert(value.gt(0), "accounts[2] does not have enough balance to transfer");
        const privKey = Accounts[2].secretKey;
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance2Before = await like.balanceOf(accounts[2]);
        const balance3Before = await like.balanceOf(accounts[3]);
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(claimedReward)), `wrong claimed reward`);
        assert((await like.balanceOf(accounts[2])).eq(balance2Before.sub(claimedReward).sub(value)), `wrong decreased balance`);
        assert((await like.balanceOf(accounts[3])).eq(balance3Before.add(value)), `wrong transferred value`);

        // transfer back
        await like.transfer(accounts[2], value, {from: accounts[3]});
        await like.transfer(accounts[2], claimedReward, {from: accounts[1]});
    });

    it(`should allow delegated transfer with empty data`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = maxReward.sub(1);
        const value = (await like.balanceOf(accounts[2])).sub(claimedReward);
        nonce += 1;
        assert(value.gt(0), "accounts[2] does not have enough balance to transfer");
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});

        // transfer back
        await like.transfer(accounts[2], value, {from: accounts[3]});
        await like.transfer(accounts[2], claimedReward, {from: accounts[1]});
    });

    it(`should allow delegated transfer claiming maxReward`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = maxReward;
        const value = (await like.balanceOf(accounts[2])).sub(claimedReward);
        nonce += 1;
        assert(value.gt(0), "accounts[2] does not have enough balance to transfer");
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});

        // transfer back
        await like.transfer(accounts[2], value, {from: accounts[3]});
        await like.transfer(accounts[2], claimedReward, {from: accounts[1]});
    });

    it(`should forbid delegated transferring more than owned`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = maxReward.sub(1);
        const value = (await like.balanceOf(accounts[2])).sub(claimedReward).add(1);
        nonce += 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid delegated transferring more than owned");
    });

    it(`should forbid claiming more reward than stated`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = maxReward.add(1);
        assert(!(await like.balanceOf(from)).lt(claimedReward), "accounts[2] does not have enough balance to transfer");
        const value = 0;
        nonce += 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid claiming more reward than stated");
    });

    it(`should forbid transferring with wrong signature`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = 0;
        const value = 0;
        nonce += 1;
        const privKey = Accounts[2].secretKey;

        let signature = signTransferAndCallDelegated(accounts[1], to, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different contract address from signature");

        signature = signTransferAndCallDelegated(like.address, from, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different from address from signature");

        signature = signTransferAndCallDelegated(like.address, to, value + 1, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different value from signature");

        signature = signTransferAndCallDelegated(like.address, to, value, data + "00", maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different data from signature");

        signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward.add(1), nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different maxReward from signature");

        signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce + 1, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with different nonce from signature");

        signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, Accounts[1].secretKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with wrong signing key");

        signature = web3Utils.randomHex(32);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferring with random signature");

        signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
    });

    it(`should forbid reusing the same nonce`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = new BigNumber(10).pow(17);
        const claimedReward = 0;
        const value = 0;
        const nonce = 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid reusing nonce");
    });

    it(`should call the callback on contract`, async () => {
        const mock = await TransferAndCallReceiverMock.new();
        const from = accounts[2];
        const to = mock.address;
        const data = "0x1234";
        const maxReward = 0;
        const claimedReward = 0;
        const value = 1;
        nonce += 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        const callbackEvent = await utils.solidityEventPromise(mock.TokenCallback());
        assert.equal(callbackEvent.args._from, accounts[2], "Wrong from address in token callback");
        assert.equal(callbackEvent.args._value, value, "Wrong value in token callback");
        assert.equal(callbackEvent.args._data, data, "Wrong data in token callback");
    });

    it(`should forbid transferring to contracts without callback`, async () => {
        const from = accounts[2];
        const to = like.address;
        const data = "0x1234";
        const maxReward = 0;
        const claimedReward = 0;
        const value = 1;
        nonce += 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferAndCall to contract without tokenCallback function");
    });

    it(`should allow owner to switch on and off transferDelegated`, async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = 0;
        const claimedReward = 0;
        const value = 1;
        nonce += 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);

        await like.switchDelegate(false, {from: accounts[0]});
        await utils.assertSolidityThrow(async () => {
            await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        }, "should forbid transferAndCallDelegated after switching off delegate");

        await like.switchDelegate(true, {from: accounts[0]});
        await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});

        // transfer back
        await like.transfer(accounts[2], value, {from: accounts[3]});

        await like.changeOwner(accounts[1], {from: accounts[0]});
        await utils.assertSolidityThrow(async () => {
            await like.switchDelegate(true, {from: accounts[1]});
        }, "should not be able to call switchDelegate before accept ownership");
        await like.switchDelegate(true, {from: accounts[0]});
        await like.switchDelegate(false, {from: accounts[0]});
        await like.changeOwner(accounts[2], {from: accounts[0]});
        await like.acceptOwnership({from: accounts[2]});
        await utils.assertSolidityThrow(async () => {
            await like.switchDelegate(true, {from: accounts[0]});
        }, "should not be able to call switchDelegate after change owner");
        await utils.assertSolidityThrow(async () => {
            await like.switchDelegate(true, {from: accounts[1]});
        }, "should not be able to call switchDelegate after change owner");
        await like.switchDelegate(true, {from: accounts[2]});
        await like.switchDelegate(false, {from: accounts[2]});

        // change back
        await like.changeOwner(accounts[0], {from: accounts[2]});
        await like.acceptOwnership({from: accounts[0]});
    });

    it(`should transfer different values of LIKE into different accounts at once`, async () => {
        const balancesBefore = {};
        const transferTargets = [2, 3, 4, 5].map((i) => accounts[i]);
        for (let i = 0; i < transferTargets.length; ++i) {
            const target = transferTargets[i];
            balancesBefore[target] = await like.balanceOf(target);
        }
        balancesBefore[accounts[1]] = await like.balanceOf(accounts[1]);
        const transferValues = [2, 3, 4, 5];
        const totalTransferValue = transferValues.reduce((sum, x) => sum + x, 0);
        assert(!(await like.balanceOf(accounts[1])).lt(totalTransferValue), `accounts[1] does not have enough LIKE balance to transfer`);
        await like.transferMultipleValues(transferTargets, transferValues, {from: accounts[1]});
        for (let i = 0; i < transferTargets.length; ++i) {
            const target = transferTargets[i];
            assert((await like.balanceOf(target)).eq(balancesBefore[target].add(transferValues[i])), `transfer target ${i} owns wrong amount of coins after transfer`);
        }
        assert((await like.balanceOf(accounts[1])).eq(balancesBefore[accounts[1]].sub(totalTransferValue)), `wrong remaining balance after transfer`);
    });

    it(`should forbid transferring to 0 targets`, async () => {
        await utils.assertSolidityThrow(async () => {
            await like.transferMultipleValues([], [], {from: accounts[1]});
        }, "should forbid transferring to 0 targets");
    });

    it(`should forbid different lengths on target list and value list`, async () => {
        await utils.assertSolidityThrow(async () => {
            await like.transferMultipleValues([accounts[2], accounts[3]], [1], {from: accounts[1]});
        }, "should forbid different lengths on target list and value list");
    });

    it(`should forbid transferring more than owning`, async () => {
        const transferTargets = [accounts[2]];
        const transferValues = [(await like.balanceOf(accounts[1])).add(1)];
        await utils.assertSolidityThrow(async () => {
            await like.transferMultipleValues(transferTargets, transferValues, {from: accounts[1]});
        }, "should forbid transferring more than owning");
    });

    it(`should allow transferring exactly all owning LIKE`, async () => {
        const transferValues = [await like.balanceOf(accounts[1])];
        await like.transferMultipleValues([accounts[2]], transferValues, {from: accounts[1]});
        // transfer back
        await like.transferMultipleValues([accounts[1]], transferValues, {from: accounts[2]});
    });

    const allowance = new BigNumber(10000);
    it(`should allow accounts[2] to transfer at most ${allowance} units of coins from accounts[1] to accounts[3]`, async () => {
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        const startingBalance3 = (await like.balanceOf(accounts[3]));
        await like.approve(accounts[2], allowance, {from: accounts[1]});
        const allowanceOf2On1 = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1.eq(allowance), "Allowance wasn't correctly set");
        await like.transferFrom(accounts[1], accounts[3], transferAmount, {from: accounts[2]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        const endingBalance3 = (await like.balanceOf(accounts[3]));
        assert(endingBalance1.eq(startingBalance1.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2), "Caller's balance should not be changed");
        assert(endingBalance3.eq(startingBalance3.add(transferAmount)), "Receiver's balance wasn't correctly changed");
        const allowanceOf2On1After = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1After.eq(allowance.sub(transferAmount)), "Allowance wasn't correctly changed");
    });

    it("should forbid unapproved transferFrom", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[3], accounts[1], 1, {from: accounts[2]});
        }, "transferFrom with invalid owner should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], 1, {from: accounts[3]});
        }, "transferFrom with invalid spender should be forbidden");
    });

    it("should forbid transferFrom more than allowance value", async () => {
        const allowanceOf2On1 = (await like.allowance(accounts[1], accounts[2]));
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], allowanceOf2On1.add(1), {from: accounts[2]});
        }, "transferFrom exceeding allowance should be forbidden");
    });

    it("should allow transfer all allowance in once", async () => {
        const allowanceOf2On1 = await like.allowance(accounts[1], accounts[2]);
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        const startingBalance3 = (await like.balanceOf(accounts[3]));
        await like.transferFrom(accounts[1], accounts[3], allowanceOf2On1, {from: accounts[2]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        const endingBalance3 = (await like.balanceOf(accounts[3]));
        assert(endingBalance1.eq(startingBalance1.sub(allowanceOf2On1)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2), "Caller's balance should not be changed");
        assert(endingBalance3.eq(startingBalance3.add(allowanceOf2On1)), "Receiver's balance wasn't correctly changed");
        const allowanceOf2On1After = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1After.eq(0), "Allowance wasn't correctly changed");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], 1, {from: accounts[2]});
        }, "Allowance should be all consumed already");
    });

    it("should allow transfer 0 LIKE", async () => {
        await like.transfer(accounts[1], 0, {from: accounts[0]});
    });

    it("should allow transfer all balance", async () => {
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance2Before = await like.balanceOf(accounts[2]);
        await like.transfer(accounts[2], balance1Before, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(0), "Sender should not have balance remaining");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before.add(balance2Before)), "Receiver's balance wasn't correctly changed");
    });

    it("should reset allowance correctly", async () => {
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance3Before = await like.balanceOf(accounts[3]);
        await like.approve(accounts[2], 2000, {from: accounts[3]});
        await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        await like.approve(accounts[2], 1, {from: accounts[3]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(1), "Allowance is not correctly reset to 1 unit");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        }, "transferFrom should fail after resetting allowance to lower than the call value");
        await like.transferFrom(accounts[3], accounts[1], 1, {from: accounts[2]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(0), "Allowance is not correctly decreased to 0 unit");
        await like.approve(accounts[2], 1000, {from: accounts[3]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(1000), "Allowance is not correctly reset to 1000 units");
        await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(2001)), "Receiver's balance wasn't correctly changed");
        assert((await like.balanceOf(accounts[3])).eq(balance3Before.sub(2001)), "Sender's balance wasn't correctly changed");
    });

    it("should maintain the total supply unchanged", async () => {
        assert((await like.totalSupply()).eq(initialAmount), "Total supply should not change");
    });

    it("should burn correct amount of coins", async () => {
        const supplyBefore = await like.totalSupply();
        const balance1Before = await like.balanceOf(accounts[1]);
        const toBurn = balance1Before.div(2).floor();
        assert(!balance1Before.eq(0), "Banalce in accounts[1] is 0 before buring, please check test case");
        assert(!toBurn.eq(0), "Burning amount is 0, please check test case");
        await like.burn(toBurn, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.sub(toBurn)), "Wrong amount of coins remaining after burning");
        assert((await like.totalSupply()).eq(supplyBefore.sub(toBurn)), "Wrong amount of supply remaining after burning");
    });

    it("should transfer and lock correctly", async () => {
        const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 10000;
        await like.registerCrowdsales(accounts[2], 1, unlockTime);
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance2 = await like.balanceOf(accounts[2]);
        assert(!balance1Before.eq(0), "Banalce in accounts[1] is 0, please check test case");
        assert(!balance2.eq(0), "Banalce in accounts[2] is 0, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferAndLock(accounts[2], 1, {from: accounts[1]});
        }, "Only crowdsale address can call transferAndLock");
        await like.transferAndLock(accounts[1], balance2, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(balance2)), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(0), "Wrong amount of coins in accounts[2] after transferAndLock");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance1Before.add(1), {from: accounts[1]});
        }, "Should not be able to transfer locked part in balance before unlockTime");
        await like.transfer(accounts[2], balance1Before, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance2), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before), "Wrong amount of coins in accounts[2] after transferAndLock");
        await like.transfer(accounts[1], balance1Before, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(balance2)), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(0), "Wrong amount of coins in accounts[2] after transferAndLock");
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(unlockTime + 1 - now);
        await like.transfer(accounts[2], balance1Before.add(1), {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance2.sub(1)), "Wrong balance on accounts[1] after unlock");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before.add(1)), "Wrong balance on accounts[2] after unlock");

        assert(!(await like.balanceOf(accounts[1])).eq(0), "accounts[1] has no balance left for transferAndLock, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferAndLock(accounts[2], 1, {from: accounts[1]});
        }, "Should not be able to transferAndLock after unlockTime");
    });
});

contract("LikeCoinEvents", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    let like;

    it("should emit Transfer event when deploy contract", async () => {
        like = await LikeCoin.new(initialAmount);
        const transferEvent = await utils.solidityEventPromise(like.Transfer());
        assert.equal(transferEvent.args._from, 0, "Transfer event has wrong value on field '_from'");
        assert.equal(transferEvent.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(transferEvent.args._value.eq(initialAmount), "Transfer event has wrong value on field '_from'");
    });

    it("should emit Transfer event after transaction", async () => {
        const callResult = await like.transferMultiple([accounts[0], accounts[1], accounts[2]], 10000, {from: accounts[0]});
        const logs = callResult.logs.filter((log) => log.event === "Transfer");
        assert.equal(logs.length, 3,  "Wrong number of Transfer events");
        for (let i = 0; i < 2; ++i) {
            const events = logs.filter((log) => log.args._to === accounts[i]);
            assert.equal(events.length, 1, `Wrong number of Transfer events for accounts[${i}]`);
            const event = events[0];
            assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
            assert(event.args._value.eq(10000), "Transfer event has wrong value on field '_value'");
        }
    });

    const transferAmount = 271;
    it("should emit Transfer event after transaction", async () => {
        const callResult = await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(transferAmount), "Transfer event has wrong value on field '_value'");
    });

    const allowance = 10000;
    it(`should emit Approval event after approve`, async () => {
        const callResult = await like.approve(accounts[1], allowance, {from: accounts[0]});
        const event = utils.solidityEvent(callResult, "Approval");
        assert.equal(event.args._owner, accounts[0], "Approval event has wrong value on field '_owner'");
        assert.equal(event.args._spender, accounts[1], "Approval event has wrong value on field '_spender'");
        assert(event.args._value.eq(allowance), "Approval event has wrong value on field '_value'");
    });

    it("should emit Transfer event after transferFrom", async () => {
        const callResult = await like.transferFrom(accounts[0], accounts[2], transferAmount, {from: accounts[1]});
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[2], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(transferAmount), "Transfer event has wrong value on field '_value'");
    });

    it("should emit Transfer event after transferMultipleValues", async () => {
        const transferTargets = [accounts[1], accounts[2], accounts[3]];
        const transferValues = [1, 2, 3];
        const callResult = await like.transferMultipleValues(transferTargets, transferValues, {from: accounts[0]});
        const logs = callResult.logs.filter((log) => log.event === "Transfer");
        assert.equal(logs.length, transferTargets.length,  "Wrong number of Transfer events");
        for (let i = 0; i < transferTargets.length; ++i) {
            const target = transferTargets[i];
            const events = logs.filter((log) => log.args._to === target);
            assert.equal(events.length, 1, `Wrong number of Transfer events for target ${i}`);
            const event = events[0];
            assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
            assert(event.args._value.eq(transferValues[i]), "Transfer event has wrong value on field '_value'");
        }
    });

    it("should emit Transfer event after transferAndCallDelegated", async () => {
        const from = accounts[2];
        const to = accounts[3];
        const data = "0x1234";
        const maxReward = 100;
        const claimedReward = 50;
        const value = (await like.balanceOf(accounts[2])).sub(claimedReward);
        assert(value.gt(0), "accounts[2] does not have enough balance to transfer");
        const nonce = 1;
        const privKey = Accounts[2].secretKey;
        const signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);

        const callResult = await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        const logs = callResult.logs.filter((log) => log.event === "Transfer");
        assert.equal(logs.length, 2,  "Wrong number of Transfer events");

        let events = logs.filter((log) => log.args._to === to);
        assert.equal(events.length, 1, `Wrong number of Transfer events for transferAndCallDelegated target`);
        let event = events[0];
        assert.equal(event.args._from, from, "Transfer event has wrong value on field '_from'");
        assert(event.args._value.eq(value), "Transfer event has wrong value on field '_value'");

        events = logs.filter((log) => log.args._to === accounts[1]);
        assert.equal(events.length, 1, `Wrong number of Transfer events for transferAndCallDelegated executor`);
        event = events[0];
        assert.equal(event.args._from, from, "Transfer event has wrong value on field '_from'");
        assert(event.args._value.eq(claimedReward), "Transfer event has wrong value on field '_value'");
    });

    const burnAmount = 161;
    it(`should emit Transfer event after burn`, async () => {
        const callResult = await like.burn(burnAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, 0x0, "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(burnAmount), "Transfer event has wrong value on field '_value'");
    });

    const crowdsaleAmount = 100000;
    it(`should emit Transfer event after minting for crowdsale`, async () => {
        const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 1000000;
        const callResult = await like.registerCrowdsales(accounts[0], crowdsaleAmount, unlockTime);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(crowdsaleAmount), "Transfer event has wrong value on field '_value'");
    });

    const contributorPoolAmount = 200000;
    it(`should emit Transfer event after minting for contributor pool`, async () => {
        const callResult = await like.registerContributorPool(accounts[0], contributorPoolAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(contributorPoolAmount), "Transfer event has wrong value on field '_value'");
    });

    const userGrowthPoolAmount = 300000;
    it(`should emit Transfer event after minting for user growth pool`, async () => {
        await like.registerUserGrowthPools([accounts[0]]);
        const callResult = await like.mintForUserGrowthPool(userGrowthPoolAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(userGrowthPoolAmount), "Transfer event has wrong value on field '_value'");
    });

    it("should emit Transfer and Lock events after transfer and lock", async () => {
        const balance = await like.balanceOf(accounts[0]);
        assert(!balance.eq(0), "Banalce in accounts[0] is 0, please check test case");
        const callResult = await like.transferAndLock(accounts[1], balance, {from: accounts[0]});
        const transferEvent = utils.solidityEvent(callResult, "Transfer");
        assert.equal(transferEvent.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(transferEvent.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert(transferEvent.args._value.eq(balance), "Transfer event has wrong value on field '_value'");
        const lockEvent = utils.solidityEvent(callResult, "Lock");
        assert.equal(lockEvent.args._addr, accounts[1], "Lock event has wrong value on field '_addr'");
        assert(lockEvent.args._value.eq(balance), "Lock event has wrong value on field '_value'");
    });

    it("should emit OwnershipChanged event after change owner", async () => {
        await like.changeOwner(accounts[1], {from: accounts[0]});
        const callResult = await like.acceptOwnership({from: accounts[1]});
        const ownershipChangedEvent = utils.solidityEvent(callResult, "OwnershipChanged");
        assert.equal(ownershipChangedEvent.args._newOwner, accounts[1], "OwnershipChanged event has wrong value on field '_newOwner'");
    });
});
