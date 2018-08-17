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
/* eslint no-underscore-dangle: off */
/* eslint no-await-in-loop: off */
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');
const BigNumber = require('bignumber.js');
const web3Utils = require('web3-utils');
const Accounts = require('./accounts.json');
const ethUtil = require('ethereumjs-util');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const SignatureCheckerImpl = artifacts.require('./SignatureCheckerImpl.sol');
const SignatureCheckerMock = artifacts.require('./SignatureCheckerMock.sol');
const TransferAndCallReceiverMock = artifacts.require('./TransferAndCallReceiverMock.sol');
const ContributorPool = artifacts.require('./ContributorPool.sol');
const CreatorsPool = artifacts.require('./CreatorsPool.sol');

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
    maxReward: maxReward.toFixed(),
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
    maxReward: maxReward.toFixed(),
    nonce,
  };
  const sig = ethUtil.ecsign(signHash(typedData.domain, signData, 'TransferAndCallDelegatedData'), ethUtil.toBuffer(privKey));
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

function signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey) {
  const signData = {
    addrs,
    values: values.map(v => v.toFixed()),
    maxReward: maxReward.toFixed(),
    nonce,
  };
  const sig = ethUtil.ecsign(signHash(typedData.domain, signData, 'TransferMultipleDelegatedData'), ethUtil.toBuffer(privKey));
  return ethUtil.toRpcSig(sig.v, sig.r, sig.s);
}

contract('LikeCoin Basic', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;

  before(async () => {
    like = await LikeCoin.new(initialAmount, 0x0, 0x0);
    await like.transfer(accounts[1], initialAmount.div(10), { from: accounts[0] });
    await like.transfer(accounts[2], initialAmount.div(10), { from: accounts[0] });
    await like.transfer(accounts[3], initialAmount.div(10), { from: accounts[0] });
    await like.transfer(accounts[4], initialAmount.div(10), { from: accounts[0] });
  });

  it('should deploy LikeCoin contract correctly', async () => {
    assert((await like.totalSupply()).eq(initialAmount), 'Wrong initial supply');
    assert.equal(await like.owner(), accounts[0], 'Wrong owner');
  });

  const transferAmount = 314;
  it('should transfer coins', async () => {
    const startingBalance0 = (await like.balanceOf(accounts[0]));
    const startingBalance1 = (await like.balanceOf(accounts[1]));

    const callResult = await like.transfer(accounts[1], transferAmount, { from: accounts[0] });
    const event = utils.solidityEvent(callResult, 'Transfer');
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, accounts[1], "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(transferAmount), "Transfer event has wrong value on field 'value'");

    const endingBalance0 = (await like.balanceOf(accounts[0]));
    const endingBalance1 = (await like.balanceOf(accounts[1]));
    assert(endingBalance0.eq(startingBalance0.sub(transferAmount)), "Sender's balance wasn't correctly changed");
    assert(endingBalance1.eq(startingBalance1.add(transferAmount)), "Receiver's balance wasn't correctly changed");
  });

  it('should forbid transferring more coins than owned', async () => {
    const balance0 = (await like.balanceOf(accounts[0]));
    const balance1 = (await like.balanceOf(accounts[1]));
    await utils.assertSolidityThrow(async () => {
      await like.transfer(accounts[2], balance0.add(1), { from: accounts[0] });
    }, 'Sending more than owned should be forbidden');
    await utils.assertSolidityThrow(async () => {
      await like.transfer(accounts[2], balance1.add(1), { from: accounts[1] });
    }, 'Sending more than owned should be forbidden');
  });

  const allowance = new BigNumber(10000);
  it('should allow user to transfer from others with allowance', async () => {
    const startingBalance0 = (await like.balanceOf(accounts[0]));
    const startingBalance1 = (await like.balanceOf(accounts[1]));
    const startingBalance2 = (await like.balanceOf(accounts[2]));

    let callResult = await like.approve(accounts[1], allowance, { from: accounts[0] });
    let event = utils.solidityEvent(callResult, 'Approval');
    assert.equal(event.args.owner, accounts[0], "Approval event has wrong value on field 'owner'");
    assert.equal(event.args.spender, accounts[1], "Approval event has wrong value on field 'spender'");
    assert(event.args.value.eq(allowance), "Approval event has wrong value on field 'value'");

    const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1]));
    assert(allowanceOf1On0.eq(allowance), "Allowance wasn't correctly set");

    callResult =
      await like.transferFrom(accounts[0], accounts[2], transferAmount, { from: accounts[1] });
    event = utils.solidityEvent(callResult, 'Transfer');
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, accounts[2], "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(transferAmount), "Transfer event has wrong value on field 'value'");

    const endingBalance0 = (await like.balanceOf(accounts[0]));
    const endingBalance1 = (await like.balanceOf(accounts[1]));
    const endingBalance2 = (await like.balanceOf(accounts[2]));
    assert(endingBalance0.eq(startingBalance0.sub(transferAmount)), "Sender's balance wasn't correctly changed");
    assert(endingBalance1.eq(startingBalance1), "Caller's balance should not be changed");
    assert(endingBalance2.eq(startingBalance2.add(transferAmount)), "Receiver's balance wasn't correctly changed");

    const allowanceOf1On0After = (await like.allowance(accounts[0], accounts[1]));
    assert(allowanceOf1On0After.eq(allowance.sub(transferAmount)), "Allowance wasn't correctly changed");

    await like.approve(accounts[1], 0, { from: accounts[0] });
  });

  it('should forbid unapproved transferFrom', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.transferFrom(accounts[2], accounts[0], 1, { from: accounts[1] });
    }, 'transferFrom with invalid owner should be forbidden');
    await utils.assertSolidityThrow(async () => {
      await like.transferFrom(accounts[0], accounts[2], 1, { from: accounts[2] });
    }, 'transferFrom with invalid spender should be forbidden');
  });

  it('should forbid transferFrom more than allowance value', async () => {
    const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1]));
    await utils.assertSolidityThrow(async () => {
      await like.transferFrom(
        accounts[0], accounts[2], allowanceOf1On0.add(1),
        { from: accounts[1] },
      );
    }, 'transferFrom exceeding allowance should be forbidden');
  });

  it('should allow transfer all allowance in once', async () => {
    const allowanceOf1On0 = await like.allowance(accounts[0], accounts[1]);
    const startingBalance0 = (await like.balanceOf(accounts[0]));
    const startingBalance1 = (await like.balanceOf(accounts[1]));
    const startingBalance2 = (await like.balanceOf(accounts[2]));
    await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0, { from: accounts[1] });
    const endingBalance0 = (await like.balanceOf(accounts[0]));
    const endingBalance1 = (await like.balanceOf(accounts[1]));
    const endingBalance2 = (await like.balanceOf(accounts[2]));
    assert(endingBalance0.eq(startingBalance0.sub(allowanceOf1On0)), "Sender's balance wasn't correctly changed");
    assert(endingBalance1.eq(startingBalance1), "Caller's balance should not be changed");
    assert(endingBalance2.eq(startingBalance2.add(allowanceOf1On0)), "Receiver's balance wasn't correctly changed");
    const allowanceOf1On0After = (await like.allowance(accounts[0], accounts[1]));
    assert(allowanceOf1On0After.eq(0), "Allowance wasn't correctly changed");
    await utils.assertSolidityThrow(async () => {
      await like.transferFrom(accounts[0], accounts[2], 1, { from: accounts[1] });
    }, 'Allowance should be all consumed already');
  });

  it('should allow transfer 0 LIKE', async () => {
    await like.transfer(accounts[1], 0, { from: accounts[0] });
  });

  it('should allow transfer all balance', async () => {
    const balance0Before = await like.balanceOf(accounts[0]);
    const balance1Before = await like.balanceOf(accounts[1]);
    assert(balance0Before.gt(0), 'Sender does not have any balance, please check test case');
    await like.transfer(accounts[1], balance0Before, { from: accounts[0] });
    assert((await like.balanceOf(accounts[0])).eq(0), 'Sender should not have balance remaining');
    assert((await like.balanceOf(accounts[1])).eq(balance0Before.add(balance1Before)), "Receiver's balance wasn't correctly changed");
  });

  it('should reset allowance correctly', async () => {
    const balance0Before = await like.balanceOf(accounts[0]);
    const balance2Before = await like.balanceOf(accounts[2]);
    await like.approve(accounts[1], 2000, { from: accounts[2] });
    await like.transferFrom(accounts[2], accounts[0], 1000, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.approve(accounts[1], 1, { from: accounts[2] });
    }, 'Approval value should be reset to 0 before setting to other values');
    await like.approve(accounts[1], 0, { from: accounts[2] });
    assert((await like.allowance(accounts[2], accounts[1])).eq(0), 'Allowance is not correctly reset to 0 unit');
    await like.approve(accounts[1], 1, { from: accounts[2] });
    assert((await like.allowance(accounts[2], accounts[1])).eq(1), 'Allowance is not correctly reset to 1 unit');
    await utils.assertSolidityThrow(async () => {
      await like.transferFrom(accounts[2], accounts[0], 1000, { from: accounts[1] });
    }, 'transferFrom should fail after resetting allowance to lower than the call value');
    await like.transferFrom(accounts[2], accounts[0], 1, { from: accounts[1] });
    assert((await like.allowance(accounts[2], accounts[1])).eq(0), 'Allowance is not correctly decreased to 0 unit');
    await like.approve(accounts[1], 1000, { from: accounts[2] });
    assert((await like.allowance(accounts[2], accounts[1])).eq(1000), 'Allowance is not correctly reset to 1000 units');
    await like.transferFrom(accounts[2], accounts[0], 1000, { from: accounts[1] });
    assert((await like.balanceOf(accounts[0])).eq(balance0Before.add(2001)), "Receiver's balance wasn't correctly changed");
    assert((await like.balanceOf(accounts[2])).eq(balance2Before.sub(2001)), "Sender's balance wasn't correctly changed");
  });

  it('should maintain the total supply unchanged', async () => {
    assert((await like.totalSupply()).eq(initialAmount), 'Total supply should not change');
  });

  it('should burn correct amount of coins', async () => {
    const supplyBefore = await like.totalSupply();
    const balance0Before = await like.balanceOf(accounts[0]);
    const toBurn = balance0Before.div(2).floor();
    assert(!balance0Before.eq(0), 'Banalce is 0 before buring, please check test case');
    assert(!toBurn.eq(0), 'Burning amount is 0, please check test case');

    const callResult = await like.burn(toBurn, { from: accounts[0] });
    const event = utils.solidityEvent(callResult, 'Transfer');
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, 0x0, "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(toBurn), "Transfer event has wrong value on field 'value'");

    assert((await like.balanceOf(accounts[0])).eq(balance0Before.sub(toBurn)), 'Wrong amount of coins remaining after burning');
    assert((await like.totalSupply()).eq(supplyBefore.sub(toBurn)), 'Wrong amount of supply remaining after burning');
  });

  it('should transfer and lock correctly', async () => {
    const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 10000;
    // For the purpose of setting unlockTime, use arbitrary contract address to call
    // registerCrowdsales
    await like.registerCrowdsales(like.address, 1, unlockTime);
    const balance0Before = await like.balanceOf(accounts[0]);
    const balance1 = await like.balanceOf(accounts[1]);
    assert(!balance0Before.eq(0), 'Banalce in accounts[0] is 0, please check test case');
    assert(!balance1.eq(0), 'Banalce in accounts[1] is 0, please check test case');

    assert.notEqual(await like.owner(), accounts[2], 'accounts[2] should not be owner, please check test case.');
    await utils.assertSolidityThrow(async () => {
      assert(!(await like.balanceOf(accounts[2])).eq(0), 'accounts[2] has no balance, please check test case.');
      await like.transferAndLock(accounts[1], 1, { from: accounts[2] });
    }, 'Only crowdsale address, owner or operator can call transferAndLock');

    await like.setOperator(accounts[1]);

    const callResult = await like.transferAndLock(accounts[0], balance1, { from: accounts[1] });
    const transferEvent = utils.solidityEvent(callResult, 'Transfer');
    assert.equal(transferEvent.args.from, accounts[1], "Transfer event has wrong value on field 'from'");
    assert.equal(transferEvent.args.to, accounts[0], "Transfer event has wrong value on field 'to'");
    assert(transferEvent.args.value.eq(balance1), "Transfer event has wrong value on field 'value'");
    const lockEvent = utils.solidityEvent(callResult, 'Lock');
    assert.equal(lockEvent.args._addr, accounts[0], "Lock event has wrong value on field '_addr'");
    assert(lockEvent.args._value.eq(balance1), "Lock event has wrong value on field '_value'");

    assert((await like.balanceOf(accounts[0])).eq(balance0Before.add(balance1)), 'Wrong amount of coins in accounts[0] after transferAndLock');
    assert((await like.balanceOf(accounts[1])).eq(0), 'Wrong amount of coins in accounts[1] after transferAndLock');

    await utils.assertSolidityThrow(async () => {
      await like.transfer(accounts[1], balance0Before.add(1), { from: accounts[0] });
    }, 'Should not be able to transfer locked part in balance before unlockTime');

    await like.transfer(accounts[1], balance0Before, { from: accounts[0] });
    assert((await like.balanceOf(accounts[0])).eq(balance1), 'Wrong amount of coins in accounts[0] after transferAndLock');
    assert((await like.balanceOf(accounts[1])).eq(balance0Before), 'Wrong amount of coins in accounts[1] after transferAndLock');
    await like.transfer(accounts[0], balance0Before, { from: accounts[1] });
    assert((await like.balanceOf(accounts[0])).eq(balance0Before.add(balance1)), 'Wrong amount of coins in accounts[0] after transferAndLock');
    assert((await like.balanceOf(accounts[1])).eq(0), 'Wrong amount of coins in accounts[1] after transferAndLock');
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((unlockTime - now) + 1);
    await like.transfer(accounts[1], balance0Before.add(1), { from: accounts[0] });
    assert((await like.balanceOf(accounts[0])).eq(balance1.sub(1)), 'Wrong balance on accounts[0] after unlock');
    assert((await like.balanceOf(accounts[1])).eq(balance0Before.add(1)), 'Wrong balance on accounts[1] after unlock');

    assert(!(await like.balanceOf(accounts[0])).eq(0), 'accounts[0] has no balance left for transferAndLock, please check test case');
    await utils.assertSolidityThrow(async () => {
      await like.transferAndLock(accounts[1], 1, { from: accounts[0] });
    }, 'Should not be able to transferAndLock after unlockTime');
  });
});

contract('LikeCoin transferMultiple', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;

  before(async () => {
    like = await LikeCoin.new(initialAmount, 0x0, 0x0);
  });

  it('should transfer coins into multiple accounts', async () => {
    const balanceBefore = await like.balanceOf(accounts[0]);
    const addrs = [1, 2, 3].map(i => accounts[i]);
    const values = [1000, 2000, 3000];
    const totalValue = values.reduce((acc, x) => acc + x, 0);

    const callResult = await like.transferMultiple(addrs, values, { from: accounts[0] });
    const logs = callResult.logs.filter(log => log.event === 'Transfer');
    assert.equal(logs.length, addrs.length, 'Wrong number of Transfer events');

    for (let i = 0; i < addrs.length; i += 1) {
      const target = addrs[i];
      const events = logs.filter(log => log.args.to === target);
      assert.equal(events.length, 1, `Wrong number of Transfer events for ${addrs[i]}`);
      const event = events[0];
      assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
      assert(event.args.value.eq(values[i]), "Transfer event has wrong value on field 'value'");
    }

    for (let i = 0; i < addrs.length; i += 1) {
      assert((await like.balanceOf(addrs[i])).eq(values[i]), `account ${addrs[i]} owns wrong amount of coins after tranferMultiple`);
    }
    assert((await like.balanceOf(accounts[0])).eq(balanceBefore.sub(totalValue)), 'Wrong balance after transferMultiple');
  });

  it('should forbid transferring more than remaining', async () => {
    const remaining = await like.balanceOf(accounts[0]);
    const addrs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => accounts[i]);
    const values = addrs.map(() => remaining.div(8).floor());
    values[0] = values[0].add(1);
    const totalValue = values.reduce((acc, x) => acc.add(x), new BigNumber(0));
    assert(totalValue.gt(remaining), 'Total transfer amount is less than remaining, please check test case');
    await utils.assertSolidityThrow(async () => {
      await like.transferMultiple(addrs, values, { from: accounts[0] });
    }, 'transferMultiple more than remaining should be forbidden');
  });

  it('should allow transferring exactly all the remaining LIKE', async () => {
    const remaining = await like.balanceOf(accounts[0]);
    const addrs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => accounts[i]);
    const values = addrs.map(() => remaining.div(8).floor());
    const totalValue = values.reduce((acc, x) => acc.add(x), new BigNumber(0));
    assert(totalValue.eq(remaining), 'Total transfer amount is less than remaining, please check test case');
    await like.transferMultiple(addrs, values, { from: accounts[0] });
    assert((await like.balanceOf(accounts[0])).eq(0), 'Still have some LIKE remaining, please check test case');
  });

  it('should forbid transferring to 0 targets', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.transferMultiple([], [], { from: accounts[1] });
    }, 'should forbid transferring to 0 targets');
  });

  it('should forbid different lengths on target list and value list', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.transferMultiple([accounts[2], accounts[3]], [1], { from: accounts[1] });
    }, 'should forbid different lengths on target list and value list');
  });
});

contract('LikeCoin transferAndCall', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let mock;

  before(async () => {
    like = await LikeCoin.new(initialAmount, 0x0, 0x0);
    mock = await TransferAndCallReceiverMock.new(like.address);
    await like.addTransferAndCallWhitelist(mock.address);
  });

  it('should transfer LIKE and call callback in contract', async () => {
    const to = mock.address;
    const value = coinsToCoinUnits(100);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';

    const callResult = await like.transferAndCall(to, value, data, { from: accounts[0] });
    const logs = callResult.logs.filter(log => log.event === 'Transfer');
    assert.equal(logs.length, 2, 'Wrong number of Transfer events');

    let events = logs.filter(log => log.args.to === to);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferAndCall receiver contract');
    let event = events[0];
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(value), "Transfer event has wrong value on field 'value'");

    events = logs.filter(log => log.args.to === '0x1024102410241024102410241024102410241024');
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferAndCall contract callback');
    [event] = events;
    assert.equal(event.args.from, to, "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(value), "Transfer event has wrong value on field 'value'");

    assert(await like.balanceOf(accounts[0]), initialAmount.sub(value), 'Wrong sender balance after transferAndCall');
    assert(await like.balanceOf(to), 0, 'Wrong receiver balance after transferAndCall');
    assert(await like.balanceOf('0x1024102410241024102410241024102410241024'), value, 'Wrong callback receiver balance after transferAndCall');
  });

  it('should forbid transferring more LIKE than owned', async () => {
    const to = mock.address;
    const value = (await like.balanceOf(accounts[0])).add(1);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCall(to, value, data, { from: accounts[0] });
    }, 'transferAndCall more than remaining should be forbidden');
  });

  it('should allow transferring exactly all owned LIKE', async () => {
    const to = mock.address;
    const value = await like.balanceOf(accounts[0]);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    await like.transferAndCall(to, value, data, { from: accounts[0] });

    // All LIKE are locked, so deploy new contract
    like = await LikeCoin.new(initialAmount, 0x0, 0x0);
    mock = await TransferAndCallReceiverMock.new(like.address);
  });

  it('should process whitelist properly', async () => {
    const to = mock.address;
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';

    await utils.assertSolidityThrow(async () => {
      await like.transferAndCall(to, value, data, { from: accounts[0] });
    }, 'should not be able to transferAndCall before adding contract to whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await like.transferAndCall(to, value, data, { from: accounts[0] });

    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(accounts[0], { from: accounts[0] });
    }, 'Should not be able to add normal address into transferAndCall whitelist');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCall(to, value, data, { from: accounts[0] });
    }, 'should not be able to transferAndCall after removing contract from whitelist');

    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Non-owners should not be able to add contracts into whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Non-owners should not be able to remove contracts from whitelist');

    await utils.assertSolidityThrow(async () => {
      await like.transferOwnership(accounts[1], { from: accounts[2] });
    }, 'Non-owners should not be able to change owner');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Pending owner should not be able to remove contracts from whitelist before accepting ownership');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Pending owner should not be able to add contracts into whitelist before accepting ownership');

    await utils.assertSolidityThrow(async () => {
      await like.claimOwnership({ from: accounts[2] });
    }, 'Only pending owner can accept ownership');
    await like.claimOwnership({ from: accounts[1] });
    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    }, 'Old owner should not be able to remove contracts from whitelist');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    }, 'Old owner should not be able to add contracts from whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
  });

  it('should throw if underlying contract throws', async () => {
    const to = mock.address;
    const value = await like.balanceOf(accounts[0]);
    const data = '0x';
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCall(to, value, data, { from: accounts[0] });
    }, 'should throw if underlying contract throws');
  });
});

contract('LikeCoin transferMultipleDelegated', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let sigChecker;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
  });

  it('should transfer coins into multiple accounts', async () => {
    const balanceBefore = await like.balanceOf(accounts[0]);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    const values = [2000, 3000, 4000];
    const totalValue = values.reduce((acc, x) => acc + x, 0);
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.div(2);
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    const caller = accounts[1];

    const callResult = await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    const logs = callResult.logs.filter(log => log.event === 'Transfer');
    assert.equal(logs.length, addrs.length + 1, 'Wrong number of Transfer events');

    const events = logs.filter(log => log.args.to === caller);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for caller');
    const event = events[0];
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(claimedReward), "Transfer event has wrong value on field 'value'");

    for (let i = 0; i < addrs.length; i += 1) {
      const target = addrs[i];
      const likeEvents = logs.filter(log => log.args.to === target);
      assert.equal(likeEvents.length, 1, `Wrong number of Transfer events for ${addrs[i]}`);
      const [likeEvent] = likeEvents;
      assert.equal(likeEvent.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
      assert(likeEvent.args.value.eq(values[i]), "Transfer event has wrong value on field 'value'");
    }

    assert((await like.balanceOf(caller)).eq(claimedReward), 'Caller owns wrong amount of coins after tranferMultiple');
    for (let i = 0; i < addrs.length; i += 1) {
      assert((await like.balanceOf(addrs[i])).eq(values[i]), `account ${addrs[i]} owns wrong amount of coins after tranferMultiple`);
    }
    assert((await like.balanceOf(accounts[0])).eq(balanceBefore.sub(totalValue).sub(claimedReward)), 'Wrong balance after transferMultiple');
  });

  it('should allow transferMultipleDelegated with only 1 target account', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const balanceBeforeFrom = await like.balanceOf(from);
    const addrs = [2].map(i => accounts[i]);
    const balanceBeforeTo = await like.balanceOf(addrs[0]);
    const values = [2000];
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.div(2);
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[1];
    const balanceBeforeCaller = await like.balanceOf(caller);
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    assert((await like.balanceOf(from)).eq(balanceBeforeFrom.sub(claimedReward).sub(values[0])), 'Sender owns wrong amount of coins after tranferMultiple');
    assert((await like.balanceOf(caller)).eq(balanceBeforeCaller.add(claimedReward)), 'Caller owns wrong amount of coins after tranferMultiple');
    assert((await like.balanceOf(addrs[0])).eq(balanceBeforeTo.add(values[0])), 'Receiver owns wrong amount of coins after tranferMultiple');
  });

  it('should forbid transferring more than remaining', async () => {
    const remaining = await like.balanceOf(accounts[0]);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const addrs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => accounts[i]);
    const values = addrs.map(() => remaining.div(8).floor());
    values[0] = values[0].add(1);
    const totalValue = values.reduce((acc, x) => acc.add(x), new BigNumber(0));
    assert(totalValue.gt(remaining), 'Total transfer amount is less than remaining, please check test case');
    const maxReward = coinsToCoinUnits(1);
    let claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[1];
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferMultiple more than remaining should be forbidden');

    values[0] = values[0].sub(1);
    claimedReward = 1;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferMultiple more than remaining should be forbidden');
  });

  it('should allow transferring exactly all the remaining LIKE', async () => {
    const remaining = await like.balanceOf(accounts[0]);
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const addrs = [1, 2, 3, 4, 5, 6, 7, 8].map(i => accounts[i]);
    const values = addrs.map(() => remaining.div(8).floor().sub(1));
    const totalValue = values.reduce((acc, x) => acc.add(x), new BigNumber(0));
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = 8;
    assert(totalValue.add(claimedReward).eq(remaining), 'Total transfer amount is less than remaining, please check test case');
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[1];
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid transferring to 0 targets', async () => {
    const from = accounts[1];
    const privKey = Accounts[1].secretKey;
    const addrs = [];
    const values = [];
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[2];
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring to 0 targets');
  });

  it('should forbid different lengths on target list and value list', async () => {
    const from = accounts[1];
    const privKey = Accounts[1].secretKey;
    const addrs = [accounts[2], accounts[3]];
    const values = [1];
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[2];
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid different lengths on target list and value list');
  });

  it('should process claimedReward correctly', async () => {
    const from = accounts[1];
    const privKey = Accounts[1].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    const values = [200, 300, 400];
    let maxReward = coinsToCoinUnits(1);
    let claimedReward = maxReward.add(1);
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[2];
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid claiming more than maxReward');

    claimedReward = maxReward;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    maxReward = 0;
    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid transferring with wrong signature', async () => {
    const from = accounts[1];
    const privKey = Accounts[1].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    const values = [200, 300, 400];
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const caller = accounts[2];

    let nonce = web3Utils.randomHex(32);

    const anotherAddrs = [2, 3, 5].map(i => accounts[i]);
    nonce = web3Utils.randomHex(32);
    let signature =
      signTransferMultipleDelegated(anotherAddrs, values, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different addrs from signature');

    const anotherValues = [201, 300, 400];
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, anotherValues, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different values from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward.add(1), nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different maxReward from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        web3Utils.randomHex(32), signature, { from: caller },
      );
    }, 'should forbid transferring with different nonce from signature');

    nonce = web3Utils.randomHex(32);
    signature = signTransferMultipleDelegated(
      addrs, values, maxReward,
      nonce, Accounts[0].secretKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with wrong signing key');

    signature = web3Utils.randomHex(65);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with random signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid reusing the same nonce', async () => {
    const from = accounts[1];
    const privKey = Accounts[1].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    let values = [200, 300, 400];
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const nonce = web3Utils.randomHex(32);
    let signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);

    const caller = accounts[2];
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid replaying executed call');

    values = [2, 3, 4];
    signature =
      signTransferMultipleDelegated(addrs, values, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid reusing nonce');
  });
});

contract('LikeCoin transferDelegated', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let sigChecker;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
  });

  it('should transfer LIKE and call callback in contract', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    const value = coinsToCoinUnits(100);
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const nonce = web3Utils.randomHex(32);
    const signature = signTransferDelegated(to, value, maxReward, nonce, privKey);
    const caller = accounts[2];

    const callResult = await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    const logs = callResult.logs.filter(log => log.event === 'Transfer');
    assert.equal(logs.length, 2, 'Wrong number of Transfer events');

    let events = logs.filter(log => log.args.to === to);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferDelegated receiver');
    let event = events[0];
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(value), "Transfer event has wrong value on field 'value'");

    events = logs.filter(log => log.args.to === caller);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferDelegated caller');
    [event] = events;
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(claimedReward), "Transfer event has wrong value on field 'value'");

    assert(await like.balanceOf(accounts[0]), initialAmount.sub(value).sub(claimedReward), 'Wrong sender balance after transferDelegated');
    assert(await like.balanceOf(to), value, 'Wrong receiver balance after transferDelegated');
    assert(await like.balanceOf(caller), claimedReward, 'Wrong caller balance after transferDelegated');
  });

  it('should forbid transferring more LIKE than owned', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    let value = (await like.balanceOf(from)).add(1);
    const maxReward = coinsToCoinUnits(1);

    let claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature = signTransferDelegated(to, value, maxReward, nonce, privKey);

    const caller = accounts[2];
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferDelegated more than remaining should be forbidden');

    value = value.sub(1);
    claimedReward = 1;
    nonce = web3Utils.randomHex(32);
    signature = signTransferDelegated(to, value, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferDelegated more than remaining should be forbidden');
  });

  it('should allow transferring exactly all owned LIKE', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    const value = (await like.balanceOf(from)).sub(1);
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = 1;
    const nonce = web3Utils.randomHex(32);
    const signature = signTransferDelegated(to, value, maxReward, nonce, privKey);

    const caller = accounts[2];
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    // All LIKE are gone, need to transfer back to continue testing
    await like.transfer(from, value, { from: to });
  });

  it('should process claimedReward correctly', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    const value = 1;
    let maxReward = coinsToCoinUnits(1);

    let claimedReward = maxReward.add(1);
    let nonce = web3Utils.randomHex(32);
    let signature = signTransferDelegated(to, value, maxReward, nonce, privKey);

    const caller = accounts[2];
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid claiming more than maxReward');

    claimedReward = maxReward;
    nonce = web3Utils.randomHex(32);
    signature = signTransferDelegated(to, value, maxReward, nonce, privKey);
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature = signTransferDelegated(to, value, maxReward, nonce, privKey);
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    maxReward = 0;
    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature = signTransferDelegated(to, value, maxReward, nonce, privKey);
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid transferring with wrong signature', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    const value = 1;
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const caller = accounts[2];

    let nonce = web3Utils.randomHex(32);

    const anotherTo = accounts[3];
    nonce = web3Utils.randomHex(32);
    let signature =
      signTransferDelegated(anotherTo, value, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different receiver address from signature');

    const anotherValue = 2;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferDelegated(to, anotherValue, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different value from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferDelegated(to, value, maxReward.add(1), nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different maxReward from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        web3Utils.randomHex(32), signature, { from: caller },
      );
    }, 'should forbid transferring with different nonce from signature');

    nonce = web3Utils.randomHex(32);
    signature = signTransferDelegated(
      to, value, maxReward,
      nonce, Accounts[1].secretKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with wrong signing key');

    signature = web3Utils.randomHex(65);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with random signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid reusing the same nonce', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = accounts[1];
    let value = 1;
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const caller = accounts[2];
    const nonce = web3Utils.randomHex(32);
    let signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);

    await like.transferDelegated(
      from, to, value, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid replaying executed call');

    value = 2;
    signature =
      signTransferDelegated(to, value, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid reusing nonce');
  });
});

contract('LikeCoin transferAndCallDelegated', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let mock;
  let sigChecker;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
    mock = await TransferAndCallReceiverMock.new(like.address);
    like.addTransferAndCallWhitelist(mock.address);
  });

  it('should transfer LIKE and call callback in contract', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = coinsToCoinUnits(100);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    const caller = accounts[1];

    const callResult = await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    const logs = callResult.logs.filter(log => log.event === 'Transfer');
    assert.equal(logs.length, 3, 'Wrong number of Transfer events');

    let events = logs.filter(log => log.args.to === to);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferAndCallDelegated receiver contract');
    let event = events[0];
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(value), "Transfer event has wrong value on field 'value'");

    events = logs.filter(log => log.args.to === caller);
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferAndCallDelegated caller');
    [event] = events;
    assert.equal(event.args.from, accounts[0], "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(claimedReward), "Transfer event has wrong value on field 'value'");

    events = logs.filter(log => log.args.to === '0x1024102410241024102410241024102410241024');
    assert.equal(events.length, 1, 'Wrong number of Transfer events for transferAndCallDelegated contract callback');
    [event] = events;
    assert.equal(event.args.from, to, "Transfer event has wrong value on field 'from'");
    assert(event.args.value.eq(value), "Transfer event has wrong value on field 'value'");

    assert(await like.balanceOf(accounts[0]), initialAmount.sub(value).sub(claimedReward), 'Wrong sender balance after transferAndCallDelegated');
    assert(await like.balanceOf(to), 0, 'Wrong receiver balance after transferAndCallDelegated');
    assert(await like.balanceOf(caller), claimedReward, 'Wrong caller balance after transferAndCallDelegated');
    assert(await like.balanceOf('0x1024102410241024102410241024102410241024'), value, 'Wrong callback receiver balance after transferAndCallDelegated');
  });

  it('should forbid transferring more LIKE than owned', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    let value = (await like.balanceOf(from)).add(1);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);

    let claimedReward = 0;
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);

    const caller = accounts[1];
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferAndCall more than remaining should be forbidden');

    value = value.sub(1);
    claimedReward = 1;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'transferAndCall more than remaining should be forbidden');
  });

  it('should allow transferring exactly all owned LIKE', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = (await like.balanceOf(from)).sub(1);
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = 1;
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);

    const caller = accounts[1];
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    // All LIKE are locked, so deploy new contract
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
    mock = await TransferAndCallReceiverMock.new(like.address);
  });

  it('should process whitelist properly', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = 1;
    const claimedReward = 1;

    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    const caller = accounts[1];

    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should not be able to transferAndCallDelegated before adding contract to whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(accounts[0], { from: accounts[0] });
    }, 'Should not be able to add normal address into transferAndCallDelegated whitelist');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should not be able to transferAndCallDelegated after removing contract from whitelist');

    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Non-owners should not be able to add contracts into whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Non-owners should not be able to remove contracts from whitelist');

    await utils.assertSolidityThrow(async () => {
      await like.transferOwnership(accounts[1], { from: accounts[2] });
    }, 'Non-owners should not be able to change owner');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Pending owner should not be able to remove contracts from whitelist before accepting ownership');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Pending owner should not be able to add contracts into whitelist before accepting ownership');

    await utils.assertSolidityThrow(async () => {
      await like.claimOwnership({ from: accounts[2] });
    }, 'Only new owner can accept ownership');
    await like.claimOwnership({ from: accounts[1] });
    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    }, 'Old owner should not be able to remove contracts from whitelist');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[0] });
    }, 'Old owner should not be able to add contracts from whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
  });

  it('should throw if underlying contract throws', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = 1;
    const data = '0x';
    const maxReward = 1;
    const claimedReward = 1;
    const nonce = web3Utils.randomHex(32);
    const signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);

    const caller = accounts[1];
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should throw if underlying contract throws');
  });

  it('should process claimedReward correctly', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    let maxReward = coinsToCoinUnits(1);

    let claimedReward = maxReward.add(1);
    let nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);

    const caller = accounts[1];
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid claiming more than maxReward');

    claimedReward = maxReward;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );

    maxReward = 0;
    claimedReward = 0;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid transferring with wrong signature', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const caller = accounts[1];

    let nonce = web3Utils.randomHex(32);

    const anotherMock = await TransferAndCallReceiverMock.new(like.address);
    const anotherTo = anotherMock.address;
    nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(anotherTo, value, data, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different receiver contract address from signature');

    const anotherValue = 2;
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, anotherValue, data, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different value from signature');

    const anotherData = '0x1338133813381338133813381338133813381338133813381338133813381338';
    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, anotherData, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different data from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward.add(1), nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with different maxReward from signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        web3Utils.randomHex(32), signature, { from: caller },
      );
    }, 'should forbid transferring with different nonce from signature');

    nonce = web3Utils.randomHex(32);
    signature = signTransferAndCallDelegated(
      to, value, data, maxReward,
      nonce, Accounts[1].secretKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with wrong signing key');

    signature = web3Utils.randomHex(65);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid transferring with random signature');

    nonce = web3Utils.randomHex(32);
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
  });

  it('should forbid reusing the same nonce', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const to = mock.address;
    let value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);
    const caller = accounts[1];
    const nonce = web3Utils.randomHex(32);
    let signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);

    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward,
      nonce, signature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid replaying executed call');

    value = 2;
    signature =
      signTransferAndCallDelegated(to, value, data, maxReward, nonce, privKey);
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward,
        nonce, signature, { from: caller },
      );
    }, 'should forbid reusing nonce');
  });
});

contract('LikeCoin delegated switch', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let mock;
  let sigChecker;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
    mock = await TransferAndCallReceiverMock.new(like.address);
    await like.addTransferAndCallWhitelist(mock.address);
  });

  it('should process delegated switch properly', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    const to = mock.address;
    const values = [200, 300, 400];
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);

    const caller = accounts[1];
    await like.switchDelegate(false, { from: accounts[0] });

    const transferNonce = web3Utils.randomHex(32);
    const transferSignature = signTransferDelegated(
      to, value, maxReward,
      transferNonce, privKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward, transferNonce,
        transferSignature, { from: caller },
      );
    }, 'should not be able to transferDelegated when delegate is switched off');

    const transferMultipleNonce = web3Utils.randomHex(32);
    const transferMultipleSignature = signTransferMultipleDelegated(
      addrs, values, maxReward,
      transferMultipleNonce, privKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward, transferMultipleNonce,
        transferMultipleSignature, { from: caller },
      );
    }, 'should not be able to transferMultipleDelegated when delegate is switched off');

    const transferAndCallNonce = web3Utils.randomHex(32);
    const transferAndCallSignature = signTransferAndCallDelegated(
      to, value, data, maxReward,
      transferAndCallNonce, privKey,
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward, transferAndCallNonce,
        transferAndCallSignature, { from: caller },
      );
    }, 'should not be able to transferAndCallDelegated when delegate is switched off');

    await like.switchDelegate(true, { from: accounts[0] });
    await like.transferDelegated(
      from, to, value, maxReward, claimedReward, transferNonce,
      transferSignature, { from: caller },
    );
    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward, transferMultipleNonce,
      transferMultipleSignature, { from: caller },
    );
    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward, transferAndCallNonce,
      transferAndCallSignature, { from: caller },
    );

    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(false, { from: accounts[1] });
    }, 'Non-owners should not be able to switch off delegate');

    await like.switchDelegate(false, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(true, { from: accounts[1] });
    }, 'Non-owners should not be able to switch on delegate');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(true, { from: accounts[1] });
    }, 'Pending owner should not be able to switch on delegate before accepting ownership');

    await like.switchDelegate(true, { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(false, { from: accounts[1] });
    }, 'Pending owner should not be able to switch off delegate before accepting ownership');

    await like.claimOwnership({ from: accounts[1] });
    await like.switchDelegate(false, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(true, { from: accounts[0] });
    }, 'Old owner should not be able to switch on delegate before accepting ownership');

    await like.switchDelegate(true, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(false, { from: accounts[0] });
    }, 'Old owner should not be able to switch off delegate before accepting ownership');
  });
});

contract('LikeCoin Signature Owner', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let mock;
  let sigChecker;
  let sigCheckerMock;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    sigCheckerMock = await SignatureCheckerMock.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
    mock = await TransferAndCallReceiverMock.new(like.address);
    await like.setOperator(accounts[1]);
    await like.addTransferAndCallWhitelist(mock.address);
  });

  it('should allow signature owner to change signature checker', async () => {
    const from = accounts[0];
    const privKey = Accounts[0].secretKey;
    const addrs = [2, 3, 4].map(i => accounts[i]);
    const to = mock.address;
    const values = [200, 300, 400];
    const value = 1;
    const data = '0x1337133713371337133713371337133713371337133713371337133713371337';
    const maxReward = coinsToCoinUnits(1);
    const claimedReward = maxReward.sub(1);

    const caller = accounts[1];

    const transferNonce = web3Utils.randomHex(32);
    const transferSignature = signTransferDelegated(
      to, value, maxReward,
      transferNonce, privKey,
    );

    const transferMultipleNonce = web3Utils.randomHex(32);
    const transferMultipleSignature = signTransferMultipleDelegated(
      addrs, values, maxReward,
      transferMultipleNonce, privKey,
    );

    const transferAndCallNonce = web3Utils.randomHex(32);
    const transferAndCallSignature = signTransferAndCallDelegated(
      to, value, data, maxReward,
      transferAndCallNonce, privKey,
    );

    await like.setSignatureChecker(sigCheckerMock.address, { from: accounts[9] });

    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(
        from, to, value, maxReward, claimedReward, transferNonce,
        transferSignature, { from: caller },
      );
    }, 'Should not be able to call transferDelegated signed using old signature schema');
    await like.transferDelegated(from, to, value, 0, 0, 0, 0, { from: caller });

    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(
        from, to, value, data, maxReward, claimedReward, transferAndCallNonce,
        transferAndCallSignature, { from: caller },
      );
    }, 'Should not be able to call transferAndCallDelegated signed using old signature schema');
    await like.transferAndCallDelegated(from, to, value, data, 0, 0, 1, 0, { from: caller });

    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(
        from, addrs, values, maxReward, claimedReward, transferMultipleNonce,
        transferMultipleSignature, { from: caller },
      );
    }, 'Should not be able to call transferMultipleDelegated signed using old signature schema');
    await like.transferMultipleDelegated(from, addrs, values, 0, 0, 2, 0, { from: caller });

    await like.setSignatureChecker(sigChecker.address, { from: accounts[9] });

    await like.transferDelegated(
      from, to, value, maxReward, claimedReward, transferNonce,
      transferSignature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferDelegated(from, to, value, 0, 0, 3, 0, { from: caller });
    }, 'Should not be able to call transferDelegated signed using old signature schema');

    await like.transferAndCallDelegated(
      from, to, value, data, maxReward, claimedReward, transferAndCallNonce,
      transferAndCallSignature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferAndCallDelegated(from, to, value, data, 0, 0, 4, 0, { from: caller });
    }, 'Should not be able to call transferAndCallDelegated signed using old signature schema');

    await like.transferMultipleDelegated(
      from, addrs, values, maxReward, claimedReward, transferMultipleNonce,
      transferMultipleSignature, { from: caller },
    );
    await utils.assertSolidityThrow(async () => {
      await like.transferMultipleDelegated(from, addrs, values, 0, 0, 5, 0, { from: caller });
    }, 'Should not be able to call transferMultipleDelegated signed using old signature schema');
  });

  it('should freeze signature checker', async () => {
    await like.freezeSignatureChecker({ from: accounts[9] });

    await utils.assertSolidityThrow(async () => {
      await like.setSignatureChecker(sigCheckerMock.address, { from: accounts[9] });
    }, 'Should forbid setting signature checker after freezing it');
  });

  it('should forbid others to change signature checker', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.setSignatureChecker(sigChecker.address, { from: accounts[0] });
    }, 'Should forbid owner to call setSignatureChecker');

    await utils.assertSolidityThrow(async () => {
      await like.freezeSignatureChecker({ from: accounts[0] });
    }, 'Should forbid owner to call setSignatureChecker');

    await utils.assertSolidityThrow(async () => {
      await like.setSignatureChecker(sigChecker.address, { from: accounts[1] });
    }, 'Should forbid operator to call setSignatureChecker');

    await utils.assertSolidityThrow(async () => {
      await like.freezeSignatureChecker({ from: accounts[1] });
    }, 'Should forbid operator to call setSignatureChecker');
  });
});

contract('LikeCoin operator', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;
  let mock;
  let sigChecker;

  before(async () => {
    sigChecker = await SignatureCheckerImpl.new();
    like = await LikeCoin.new(initialAmount, accounts[9], sigChecker.address);
    mock = await TransferAndCallReceiverMock.new(like.address);
    await like.setOperator(accounts[1]);
  });

  it('should allow operator to switch delegated', async () => {
    await like.switchDelegate(false, { from: accounts[1] });
    await like.switchDelegate(true, { from: accounts[1] });

    await like.setOperator(accounts[2]);

    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(false, { from: accounts[1] });
    }, 'Should forbid old operator to switch off delegated');

    await like.switchDelegate(false, { from: accounts[2] });

    await utils.assertSolidityThrow(async () => {
      await like.switchDelegate(true, { from: accounts[1] });
    }, 'Should forbid old operator to switch on delegated');

    await like.switchDelegate(true, { from: accounts[2] });
  });

  it('should allow operator to add and remove transferAndCall whitelist', async () => {
    await like.setOperator(accounts[1]);
    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });

    await like.setOperator(accounts[2]);

    await utils.assertSolidityThrow(async () => {
      await like.addTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Should forbid old operator to add transferAndCall whitelist');

    await like.addTransferAndCallWhitelist(mock.address, { from: accounts[2] });

    await utils.assertSolidityThrow(async () => {
      await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[1] });
    }, 'Should forbid old operator to remove transferAndCall whitelist');

    await like.removeTransferAndCallWhitelist(mock.address, { from: accounts[2] });
  });

  it('should limit operator permission', async () => {
    await like.setOperator(accounts[1]);

    await utils.assertSolidityThrow(async () => {
      await like.transferOwnership(accounts[2], { from: accounts[1] });
    }, 'Should forbid operator to change owner');

    await utils.assertSolidityThrow(async () => {
      await like.setOperator(accounts[2], { from: accounts[1] });
    }, 'Should forbid operator to set operator');

    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(like.address, 1, now + 100000, { from: accounts[1] });
    }, 'Should forbid operator to register crowdsale');

    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(like.address, 1, { from: accounts[1] });
    }, 'Should forbid operator to register contributor pool');

    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools([like.address], 1, { from: accounts[1] });
    }, 'Should forbid operator to register creators pool');
  });

  it('should allow operator to call transferAndLock', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    // For the purpose of setting unlockTime, use arbitrary contract address to call
    // registerCrowdsales
    await like.registerCrowdsales(like.address, 1, now + 100000);
    await like.transfer(accounts[1], initialAmount.div(10));
    await like.transfer(accounts[2], initialAmount.div(10));

    await like.transferAndLock(accounts[2], 1, { from: accounts[1] });

    await like.setOperator(accounts[2]);

    await utils.assertSolidityThrow(async () => {
      await like.transferAndLock(accounts[2], 1, { from: accounts[1] });
    }, 'Should forbid old operator to call transferAndLock');

    await like.transferAndLock(accounts[1], 1, { from: accounts[2] });

    await like.setOperator(accounts[1]);
    await like.transferAndLock(accounts[2], 1, { from: accounts[1] });
  });
});

contract('LikeCoin register', (accounts) => {
  it('should restrict registers', async () => {
    const like = await LikeCoin.new(0, 0x0, 0x0);

    const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 10000;
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(accounts[0], 1, unlockTime);
    }, 'Should forbid registering non-contract address as Crowdsale');
    await like.registerCrowdsales(like.address, 1, unlockTime);
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(like.address, 1, unlockTime);
    }, 'Should forbid registering Crowdsale again');

    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(accounts[0], 1);
    }, 'Should forbid registering non-contract address as ContributorPool');
    await like.registerContributorPool(like.address, 1);
    await utils.assertSolidityThrow(async () => {
      await like.registerContributorPool(like.address, 1);
    }, 'Should forbid registering ContributorPool again');

    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools([accounts[0], accounts[1]], 1);
    }, 'Should forbid registering non-contract addresses as CreatorsPools');
    await like.registerCreatorsPools([like.address], 1);
    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools([like.address], 1);
    }, 'Should forbid registering CreatorsPools again');
  });
});

contract('LikeCoin Events', (accounts) => {
  const initialAmount = coinsToCoinUnits(10000);
  let like;

  it('should emit Transfer event when deploy contract', async () => {
    like = await LikeCoin.new(initialAmount, 0x0, 0x0);
    const transferEvent = await utils.solidityEventPromise(like.Transfer());
    assert.equal(transferEvent.args.from, 0x0, "Transfer event has wrong value on field 'from'");
    assert.equal(transferEvent.args.to, accounts[0], "Transfer event has wrong value on field 'to'");
    assert(transferEvent.args.value.eq(initialAmount), "Transfer event has wrong value on field 'from'");
  });

  const crowdsaleAmount = 100000;
  it('should emit Transfer event after minting for crowdsale', async () => {
    const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 1000000;
    const callResult = await like.registerCrowdsales(like.address, crowdsaleAmount, unlockTime);
    const event = utils.solidityEvent(callResult, 'Transfer');
    assert.equal(event.args.from, 0x0, "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, like.address, "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(crowdsaleAmount), "Transfer event has wrong value on field 'value'");
  });

  const contributorPoolAmount = 200000;
  it('should emit Transfer event after minting for contributor pool', async () => {
    const contributorPool =
      await ContributorPool.new(like.address, 1, contributorPoolAmount);
    await like.registerContributorPool(contributorPool.address, contributorPoolAmount);
    await contributorPool.mint();
    const event = await utils.solidityEventPromise(like.Transfer());
    assert.equal(event.args.from, 0x0, "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, contributorPool.address, "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(contributorPoolAmount), "Transfer event has wrong value on field 'value'");
  });

  const creatorsPoolAmount = 300000;
  it('should emit Transfer event after minting for creators pool', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const creatorsPool =
      await CreatorsPool.new(like.address, [accounts[0]], 1, now - 100, creatorsPoolAmount);
    await like.registerCreatorsPools([creatorsPool.address], creatorsPoolAmount);
    await creatorsPool.mint();
    const event = await utils.solidityEventPromise(like.Transfer());
    assert.equal(event.args.from, 0x0, "Transfer event has wrong value on field 'from'");
    assert.equal(event.args.to, creatorsPool.address, "Transfer event has wrong value on field 'to'");
    assert(event.args.value.eq(creatorsPoolAmount), "Transfer event has wrong value on field 'value'");
  });

  it('should emit OwnershipTransferred event after change owner', async () => {
    await like.transferOwnership(accounts[1], { from: accounts[0] });
    const callResult = await like.claimOwnership({ from: accounts[1] });
    const ownershipTransferredEvent = utils.solidityEvent(callResult, 'OwnershipTransferred');
    assert.equal(ownershipTransferredEvent.args.previousOwner, accounts[0], "OwnershipTransferred event has wrong value on field 'previousOwner'");
    assert.equal(ownershipTransferredEvent.args.newOwner, accounts[1], "OwnershipTransferred event has wrong value on field 'newOwner'");
  });
});

// vim: set ts=2 sw=2:
