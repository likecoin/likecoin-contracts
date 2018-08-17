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
/* eslint no-console: off */
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');
const web3Utils = require('web3-utils');
const Accounts = require('./accounts.json');
const web3Abi = require('web3-eth-abi');
const ethUtil = require('ethereumjs-util');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const LikeCrowdsale = artifacts.require('./LikeCrowdsale.sol');
const ContributorPool = artifacts.require('./ContributorPool.sol');
const CreatorsPool = artifacts.require('./CreatorsPool.sol');
const SignatureCheckerImpl = artifacts.require('./SignatureCheckerImpl.sol');
const TransferAndCallReceiverMock = artifacts.require('./TransferAndCallReceiverMock.sol');
const TransferAndCallReceiverMock2 = artifacts.require('./TransferAndCallReceiverMock2.sol');

const { coinsToCoinUnits, signHash } = utils;

const typedData = {
  domain: {
    name: 'LikeCoin',
    version: '1',
    chainId: 1,
    verifyingContract: '0x02F61Fd266DA6E8B102D4121f5CE7b992640CF98',
  },
};

function signTransferDelegated(to, value, maxReward, nonce, privKey) {
  const signData = {
    to,
    value: value.toFixed(),
    maxReward,
    nonce,
  };
  const sig = ethUtil.ecsign(signHash(typedData.domain, signData, 'TransferDelegatedData'), ethUtil.toBuffer(privKey));
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

function signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey) {
  const signData = {
    to,
    value: value.toFixed(),
    data,
    maxReward,
    nonce,
  };
  const sig = ethUtil.ecsign(signHash(typedData.domain, signData, 'TransferAndCallDelegatedData'), ethUtil.toBuffer(privKey));
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

function signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey) {
  const signData = {
    addrs,
    values: values.map(v => v.toFixed()),
    maxReward,
    nonce,
  };
  const sig = ethUtil.ecsign(signHash(typedData.domain, signData, 'TransferMultipleDelegatedData'), ethUtil.toBuffer(privKey));
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

function encodeMock2(to, value, key) {
  const bytesBuf = ['0x'];
  bytesBuf.push(web3Abi.encodeParameter('address', to).substr(2 + (12 * 2)));
  bytesBuf.push(web3Abi.encodeParameter('uint256', value).substr(2));
  bytesBuf.push(web3Abi.encodeParameter('bytes32', key).substr(2));
  return bytesBuf.join('');
}

contract('LikeCoin Gas Estimation', (accounts) => {
  it('Gas for deployment', async () => {
    const sigChecker = await SignatureCheckerImpl.new();
    let block = web3.eth.getBlock(web3.eth.blockNumber);
    assert.equal(block.transactions.length, 1, 'Wrong number of transactions in latest block');
    console.log(`Deployed SignatureCheckerImpl, gas used = ${block.gasUsed}`);

    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, sigChecker.address);
    block = web3.eth.getBlock(web3.eth.blockNumber);
    assert.equal(block.transactions.length, 1, 'Wrong number of transactions in latest block');
    console.log(`Deployed LikeCoin, gas used = ${block.gasUsed}`);

    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await LikeCrowdsale.new(like.address, now + 100, now + 1000, 1);
    block = web3.eth.getBlock(web3.eth.blockNumber);
    assert.equal(block.transactions.length, 1, 'Wrong number of transactions in latest block');
    console.log(`Deployed LikeCrowdsale, gas used = ${block.gasUsed}`);

    await ContributorPool.new(like.address, 1, 1);
    block = web3.eth.getBlock(web3.eth.blockNumber);
    assert.equal(block.transactions.length, 1, 'Wrong number of transactions in latest block');
    console.log(`Deployed ContributorPool, gas used = ${block.gasUsed}`);

    await CreatorsPool.new(like.address, [accounts[0]], 1, now + 100, 1);
    block = web3.eth.getBlock(web3.eth.blockNumber);
    assert.equal(block.transactions.length, 1, 'Wrong number of transactions in latest block');
    console.log(`Deployed CreatorsPool, gas used = ${block.gasUsed}`);
  });

  it('Gas for normal transfer', async () => {
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, 0x0);
    let callResult = await like.transfer(accounts[1], coinsToCoinUnits(100));
    console.log(`Normal transfer, first time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transfer(accounts[1], coinsToCoinUnits(100));
    console.log(`Normal transfer, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferDelegated', async () => {
    const sigChecker = await SignatureCheckerImpl.new();
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, sigChecker.address);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    const value = coinsToCoinUnits(100);
    const maxReward = 0;
    const claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);
    let callResult = await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: accounts[2] },
    );
    console.log(`transferDelegated, first time gas used = ${callResult.receipt.gasUsed}`);
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);
    callResult = await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: accounts[2] },
    );
    console.log(`transferDelegated, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferMultiple', async () => {
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, 0x0);
    let addrs = [1, 2, 3, 4, 5].map(i => accounts[i]);
    let values = [1, 2, 3, 4, 5].map(n => coinsToCoinUnits(n * 100));
    let callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

    addrs = [6, 7, 8].map(i => accounts[i]);
    values = [6, 7, 8].map(n => coinsToCoinUnits(n * 100));
    callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

    addrs = [9].map(i => accounts[i]);
    values = [9].map(n => coinsToCoinUnits(n * 100));
    callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transferMultiple(addrs, values);
    console.log(`transferMultiple, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferMultipleDelegated', async () => {
    const sigChecker = await SignatureCheckerImpl.new();
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, sigChecker.address);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const maxReward = 0;
    const claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferMultipleDelegated([accounts[0]], [0], maxReward, nonce, privKey);
    await like.transferMultipleDelegated(
      from, [accounts[0]], [0], maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );

    let addrs = [1, 2, 3, 4, 5].map(i => accounts[i]);
    let values = [1, 2, 3, 4, 5].map(n => coinsToCoinUnits(n * 100));
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    let callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

    addrs = [6, 7, 8].map(i => accounts[i]);
    values = [6, 7, 8].map(n => coinsToCoinUnits(n * 100));
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);

    addrs = [9].map(i => accounts[i]);
    values = [9].map(n => coinsToCoinUnits(n * 100));
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, first time gas used = ${callResult.receipt.gasUsed}`);
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferMultipleDelegated, count = ${addrs.length}, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferAndCall', async () => {
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, 0x0);
    const mock = await TransferAndCallReceiverMock.new(like.address);
    await like.addTransferAndCallWhitelist(mock.address);
    const to = mock.address;
    const value = coinsToCoinUnits(100);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    let callResult = await like.transferAndCall(to, value, data);
    console.log(`transferAndCall, first time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transferAndCall(to, value, data);
    console.log(`transferAndCall, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferAndCallDelegated', async () => {
    const sigChecker = await SignatureCheckerImpl.new();
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, sigChecker.address);
    const mock = await TransferAndCallReceiverMock.new(like.address);
    await like.addTransferAndCallWhitelist(mock.address);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = coinsToCoinUnits(100);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = 0;
    const claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    let callResult = await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferAndCallDelegated, first time gas used = ${callResult.receipt.gasUsed}`);
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    callResult = await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: accounts[1] },
    );
    console.log(`transferAndCallDelegated, second time gas used = ${callResult.receipt.gasUsed}`);
  });

  it('Gas for transferAndCall (Mock 2)', async () => {
    const like = await LikeCoin.new(coinsToCoinUnits(1000000), 0x0, 0x0);
    const mock = await TransferAndCallReceiverMock.new(like.address);
    const mock2 = await TransferAndCallReceiverMock2.new(like.address, mock.address);
    await like.addTransferAndCallWhitelist(mock2.address);
    const to = mock2.address;
    const value = coinsToCoinUnits(100);
    const data = encodeMock2(to, value, '0x1337133713371337133713371337133713371337133713371337133713371337');
    let callResult = await like.transferAndCall(to, value, data);
    console.log(`First time gas used = ${callResult.receipt.gasUsed}`);
    callResult = await like.transferAndCall(to, value, data);
    console.log(`Second time gas used = ${callResult.receipt.gasUsed}`);
  });
});

// vim: set ts=2 sw=2:
