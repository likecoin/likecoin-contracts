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
/* global artifacts, contract */

const utils = require("./utils.js");
const coinsToCoinUnits = utils.coinsToCoinUnits;
const LikeCoin = artifacts.require("./LikeCoin.sol");
const TransferAndCallReceiverMock = artifacts.require("./TransferAndCallReceiverMock.sol");
const TransferAndCallReceiverMock2 = artifacts.require("./TransferAndCallReceiverMock2.sol");
const web3Utils = require("web3-utils");
const AccountLib = require("eth-lib/lib/account");
const Accounts = require("./accounts.json");
const web3Abi = require("web3-eth-abi");

function signTypedCall(signData, privKey) {
    const paramSignatures = signData.map((item) => ({type: "string", value: `${item.type} ${item.name}`}));
    const params = signData.map((item) => ({type: item.type, value: item.value}));
    const hash = web3Utils.soliditySha3(
        {type: "bytes32", value: web3Utils.soliditySha3(...paramSignatures)},
        {type: "bytes32", value: web3Utils.soliditySha3(...params)},
    );
    return AccountLib.sign(hash, privKey);
}

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
    return signTypedCall(signData, privKey);
}

function signTransferMultipleDelegated(likeAddr, addrs, values, maxReward, nonce, privKey) {
    const signData = [
        { type: "address", name: "contract", value: likeAddr },
        { type: "string", name: "method", value: "transferMultipleDelegated" },
        { type: "address[]", name: "addrs", value: addrs },
        { type: "uint256[]", name: "values", value: values },
        { type: "uint256", name: "maxReward", value: maxReward },
        { type: "uint256", name: "nonce", value: nonce }
    ];
    return signTypedCall(signData, privKey);
}

function encodeMock2(to, value, key) {
    const bytesBuf = ["0x"];
    bytesBuf.push(web3Abi.encodeParameter("address", to).substr(2 + 12 * 2));
    bytesBuf.push(web3Abi.encodeParameter("uint256", value).substr(2));
    bytesBuf.push(web3Abi.encodeParameter("bytes32", key).substr(2));
    return bytesBuf.join("");
}

contract("LikeCoin", (accounts) => {
    it(`Gas for builtin transferMultiple`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        let addrs = [1, 2, 3, 4, 5].map((i) => accounts[i]);
        let values = [1, 2, 3, 4, 5].map((n) => coinsToCoinUnits(n * 100));
        let callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

        addrs = [6, 7, 8].map((i) => accounts[i]);
        values = [6, 7, 8].map((n) => coinsToCoinUnits(n * 100));
        callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

        addrs = [9].map((i) => accounts[i]);
        values = [9].map((n) => coinsToCoinUnits(n * 100));
        callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transferMultiple(addrs, values);
        console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);
    });

    it(`Gas for transferMultipleDelegated`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        const from = accounts[0];
        const privKey = Accounts[0].secretKey;
        const maxReward = 0;
        const claimedReward = 0;
        let nonce = web3Utils.randomHex(32);
        let signature = signTransferMultipleDelegated(like.address, [accounts[0]], [0], maxReward, nonce, privKey);
        await like.transferMultipleDelegated(from, [accounts[0]], [0], maxReward, claimedReward, nonce, signature, {from: accounts[1]});

        let addrs = [1, 2, 3, 4, 5].map((i) => accounts[i]);
        let values = [1, 2, 3, 4, 5].map((n) => coinsToCoinUnits(n * 100));
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        let callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

        addrs = [6, 7, 8].map((i) => accounts[i]);
        values = [6, 7, 8].map((n) => coinsToCoinUnits(n * 100));
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

        addrs = [9].map((i) => accounts[i]);
        values = [9].map((n) => coinsToCoinUnits(n * 100));
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
        nonce = web3Utils.randomHex(32);
        signature = signTransferMultipleDelegated(like.address, addrs, values, maxReward, nonce, privKey);
        callResult = await like.transferMultipleDelegated(from, addrs, values, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);
    });

    it(`Gas for transferAndCall`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        const mock = await TransferAndCallReceiverMock.new(like.address);
        await like.addTransferAndCallWhitelist(mock.address);
        const to = mock.address;
        const value = coinsToCoinUnits(100);
        const data = "0x1337133713371337133713371337133713371337133713371337133713371337";
        let callResult = await like.transferAndCall(to, value, data);
        console.log(`transferAndCall, first time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transferAndCall(to, value, data);
        console.log(`transferAndCall, second time gas used = ${callResult.receipt.gasUsed}`);
    });

    it(`Gas for transferAndCallDelegated`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        const mock = await TransferAndCallReceiverMock.new(like.address);
        await like.addTransferAndCallWhitelist(mock.address);
        const from = accounts[0];
        const privKey = Accounts[0].secretKey;
        const to = mock.address;
        const value = coinsToCoinUnits(100);
        const data = "0x1337133713371337133713371337133713371337133713371337133713371337";
        const maxReward = 0;
        const claimedReward = 0;
        let nonce = web3Utils.randomHex(32);
        let signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        let callResult = await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferAndCallDelegated, first time gas used = ${callResult.receipt.gasUsed}`);
        nonce = web3Utils.randomHex(32);
        signature = signTransferAndCallDelegated(like.address, to, value, data, maxReward, nonce, privKey);
        callResult = await like.transferAndCallDelegated(from, to, value, data, maxReward, claimedReward, nonce, signature, {from: accounts[1]});
        console.log(`transferAndCallDelegated, second time gas used = ${callResult.receipt.gasUsed}`);
    });

    it(`Gas for normal transfer`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        let callResult = await like.transfer(accounts[1], coinsToCoinUnits(100));
        console.log(`Normal transfer, first time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transfer(accounts[1], coinsToCoinUnits(100));
        console.log(`Normal transfer, second time gas used = ${callResult.receipt.gasUsed}`);
    });

    it(`Gas for transferAndCall (Mock 2)`, async () => {
        const like = await LikeCoin.new(coinsToCoinUnits(1000000));
        const mock = await TransferAndCallReceiverMock.new(like.address);
        const mock2 = await TransferAndCallReceiverMock2.new(like.address, mock.address);
        await like.addTransferAndCallWhitelist(mock2.address);
        const to = mock2.address;
        const value = coinsToCoinUnits(100);
        const data = encodeMock2(to, value, "0x1337133713371337133713371337133713371337133713371337133713371337");
        let callResult = await like.transferAndCall(to, value, data);
        console.log(`First time gas used = ${callResult.receipt.gasUsed}`);
        callResult = await like.transferAndCall(to, value, data);
        console.log(`Second time gas used = ${callResult.receipt.gasUsed}`);
    });
});
