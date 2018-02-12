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
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');
const BigNumber = require('bignumber.js');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const LikeCrowdsale = artifacts.require('./LikeCrowdsale.sol');

const { coinsToCoinUnits } = utils;

const initialSupply = coinsToCoinUnits(10);
const hardCap = coinsToCoinUnits(1000000000);
const coinsPerEth = 25000;
const crowdsaleLength = 60 * 60 * 24 * 7;

contract('LikeCoin Crowdsale 1', (accounts) => {
  const privateFunds = {
    5: coinsToCoinUnits(10000000),
    6: coinsToCoinUnits(12000000),
  };

  const buyCoins = {
    1: coinsToCoinUnits(25000),
    2: coinsToCoinUnits(8000000),
    3: coinsToCoinUnits(7000000),
    4: coinsToCoinUnits(62975000),
  };

  const buyWeis = {
    1: buyCoins[1].div(coinsPerEth), // 1 Ether
    2: buyCoins[2].div(coinsPerEth), // 320 Ether
    3: buyCoins[3].div(coinsPerEth), // 280 Ether
    4: buyCoins[4].div(coinsPerEth), // 2,519 Ether
  };

  let unlockTime;
  let start;
  let end;
  let like;
  let crowdsale;

  before(async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    start = now + 1000;
    end = start + crowdsaleLength;
    unlockTime = end + 10000;
    like = await LikeCoin.new(initialSupply, 0x0, 0x0);
    crowdsale =
      await LikeCrowdsale.new(like.address, start, end, coinsPerEth);
  });

  it('should deploy the crowdsale contract correctly', async () => {
    assert.equal(await crowdsale.owner(), accounts[0], 'LikeCrowdsale contract has wrong owner');
    assert((await crowdsale.start()).eq(start), 'LikeCrowdsale contract has wrong start');
    assert((await crowdsale.end()).eq(end), 'LikeCrowdsale contract has wrong end');
    assert((await crowdsale.coinsPerEth()).eq(coinsPerEth), 'LikeCrowdsale contract has wrong coinsPerEth');
  });

  it('should forbid non-owner to register crowdsale contract', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, { from: accounts[1] });
    }, 'should forbid accounts[1] to register crowdsale contract');

    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, { from: accounts[1] });
    }, 'should forbid pending owner accounts[1] to register crowdsale contract');

    await like.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, { from: accounts[0] });
    }, 'should forbid accounts[0] to register crowdsale contract after changing owner');
    // change back
    await like.transferOwnership(accounts[0], { from: accounts[1] });
    await like.claimOwnership({ from: accounts[0] });
  });

  it(`should mint ${hardCap.toFixed()} units of coins`, async () => {
    await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
    const supply = await like.totalSupply();
    const expected = initialSupply.add(hardCap);
    assert(supply.eq(expected), `${expected.toFixed()} units of coins should be minted`);
  });

  it(`should give the crowdsale contract ${hardCap.toFixed()} units of coins`, async () => {
    const balance = await like.balanceOf(crowdsale.address);
    assert(balance.eq(hardCap), `The crowdsale contract should own ${hardCap.toFixed()} units of coins`);
  });

  it('should forbid registering crowdsale contract again', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
    }, 'Can register crowdsale contract once only');
  });

  it('should add private fund correctly', async () => {
    const remaining1 = await like.balanceOf(crowdsale.address);

    const privateFundEvent1 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[5], privateFunds[5].sub(100)), 'AddPrivateFund');
    assert.equal(privateFundEvent1.args._addr, accounts[5], "AddPrivateFund event has wrong value on field '_addr'");
    assert(privateFundEvent1.args._value.eq(privateFunds[5].sub(100)), "AddPrivateFund event has wrong value on field '_value'");
    const remaining2 = await like.balanceOf(crowdsale.address);
    const account5Coins = await like.balanceOf(accounts[5]);
    assert(remaining2.eq(remaining1.sub(privateFunds[5].sub(100))), 'Wrong remaining coins after adding private fund');
    assert(account5Coins.eq(privateFunds[5].sub(100)), 'Wrong amount of coins on accounts[5] after adding private fund (1st time)');

    const privateFundEvent2 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[6], privateFunds[6]), 'AddPrivateFund');
    assert.equal(privateFundEvent2.args._addr, accounts[6], "AddPrivateFund event has wrong value on field '_addr'");
    assert(privateFundEvent2.args._value.eq(privateFunds[6]), "AddPrivateFund event has wrong value on field '_value'");
    const remaining3 = await like.balanceOf(crowdsale.address);
    const account6Coins = await like.balanceOf(accounts[6]);
    assert(remaining3.eq(remaining2.sub(privateFunds[6])), 'Wrong remaining coins after adding private fund');
    assert(account6Coins.eq(privateFunds[6]), 'Wrong amount of coins on accounts[6] after adding private fund');

    const privateFundEvent3 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[5], 100), 'AddPrivateFund');
    assert.equal(privateFundEvent3.args._addr, accounts[5], "AddPrivateFund event has wrong value on field '_addr'");
    assert(privateFundEvent3.args._value.eq(100), "AddPrivateFund event has wrong value on field '_value'");
    const remaining4 = await like.balanceOf(crowdsale.address);
    assert(remaining4.eq(remaining3.sub(100)), 'Wrong remaining coins after adding private fund');
    assert((await like.balanceOf(accounts[5])).eq(privateFunds[5]), 'Wrong amount of coins on accounts[5] after adding private fund (2nd time)');
  });

  it('should forbid adding private fund more than remaining coins', async () => {
    const remaining = await like.balanceOf(crowdsale.address);
    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[7], remaining.add(1));
    }, 'should forbid adding private fund more than remaining coins');
  });

  it('should forbid non-owner to add private fund', async () => {
    const remaining = await like.balanceOf(crowdsale.address);
    assert(!remaining.eq(0), 'Remaining coins is 0, please check test case');
    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[7], remaining, { from: accounts[1] });
    }, 'should forbid adding private fund from accounts[1]');

    await crowdsale.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[7], remaining, { from: accounts[1] });
    }, 'should forbid adding private fund from pending owner accounts[1]');

    const callResult = await crowdsale.claimOwnership({ from: accounts[1] });
    const ownershipTransferredEvent = utils.solidityEvent(callResult, 'OwnershipTransferred');
    assert.equal(ownershipTransferredEvent.args.previousOwner, accounts[0], "OwnershipTransferred event has wrong value on field 'previousOwner'");
    assert.equal(ownershipTransferredEvent.args.newOwner, accounts[1], "OwnershipTransferred event has wrong value on field 'newOwner'");
    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[7], remaining, { from: accounts[0] });
    }, 'should forbid adding private fund from old owner accounts[0]');

    // change back
    await crowdsale.transferOwnership(accounts[0], { from: accounts[1] });
    await crowdsale.claimOwnership({ from: accounts[0] });
  });

  it('should lock private fund until unlock time', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, unlockTime, 'Blocktime is already after unlock time, please adjust test case');
    const balance = await like.balanceOf(accounts[5]);
    assert(!balance.eq(0), 'Remaining coins is 0, please check test case');
    await utils.assertSolidityThrow(async () => {
      await like.transfer(accounts[7], 1, { from: accounts[5] });
    }, 'should lock private fund until unlock time');
  });

  it('should forbid non-owner to call transferLike', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[0], 1, { from: accounts[1] });
    }, 'Calling transferLike from non-owner should be forbidden');

    await crowdsale.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[0], 1, { from: accounts[1] });
    }, 'Calling transferLike from pending owner should be forbidden');

    await crowdsale.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[0], 1, { from: accounts[0] });
    }, 'Calling transferLike from old owner should be forbidden');

    // change back
    await crowdsale.transferOwnership(accounts[0], { from: accounts[1] });
    await crowdsale.claimOwnership({ from: accounts[0] });
  });

  it('should be able to transfer LIKE before crowdsale starts', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, start, 'Blocktime is already after crowdsale start, please adjust test case');
    const balanceBefore = await like.balanceOf(accounts[8]);
    const remainingBefore = await like.balanceOf(crowdsale.address);
    const callResult = await crowdsale.transferLike(accounts[8], 100000, { from: accounts[0] });
    const likeTransferEvent = utils.solidityEvent(callResult, 'LikeTransfer');
    assert.equal(likeTransferEvent.args._to, accounts[8], "LikeTransfer event has wrong value on field '_to'");
    assert(likeTransferEvent.args._value.eq(100000), "LikeTransfer event has wrong value on field '_value'");
    assert((await like.balanceOf(accounts[8])).eq(balanceBefore.add(100000)), 'Value of Transferred balance is wrong');
    assert((await like.balanceOf(crowdsale.address)).eq(remainingBefore.sub(100000)), 'Remaining balance is wrong');
  });

  it('should forbid buying coins before crowdsale starts', async () => {
    const event = utils.solidityEvent(await crowdsale.registerKYC([accounts[1]]), 'RegisterKYC');
    assert.equal(event.args._addr, accounts[1], "RegisterKYC event has wrong value on field '_addr'");
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, start, 'Blocktime is already after crowdsale start, please adjust test case');
    await utils.assertSolidityThrow(async () => {
      await web3.eth.sendTransaction({
        from: accounts[1],
        to: crowdsale.address,
        value: buyWeis[1],
        gas: '200000',
      });
    }, 'Buying coins before crowdsale starts should be forbidden');
  });

  it('should forbid transfer LIKE after crowdsale starts and before crowdsale ends', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, start, 'Blocktime is already after crowdsale start, please adjust test case');
    await utils.testrpcIncreaseTime((start - now) + 1);
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[8], 1, { from: accounts[0] });
    }, 'should forbid transfer LIKE after crowdsale starts and before crowdsale ends');
  });

  it('should forbid buying coins before KYC', async () => {
    await utils.assertSolidityThrow(async () => {
      await web3.eth.sendTransaction({
        from: accounts[2],
        to: crowdsale.address,
        value: buyWeis[2],
        gas: '200000',
      });
    }, 'Buying coins before KYC should be forbidden');
  });

  it('should forbid non-owner to register KYC', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.registerKYC([accounts[2]], { from: accounts[1] });
    }, 'Calling registerKYC from non-owner should be forbidden');

    await crowdsale.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.registerKYC([accounts[2]], { from: accounts[1] });
    }, 'Calling registerKYC from pending owner should be forbidden');

    await crowdsale.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.registerKYC([accounts[2]], { from: accounts[0] });
    }, 'Calling registerKYC from old owner should be forbidden');

    // change back
    await crowdsale.transferOwnership(accounts[0], { from: accounts[1] });
    await crowdsale.claimOwnership({ from: accounts[0] });
  });

  it('should allow buying coins after KYC', async () => {
    const remaining1 = await like.balanceOf(crowdsale.address);
    await web3.eth.sendTransaction({
      from: accounts[1],
      to: crowdsale.address,
      value: buyWeis[1],
      gas: '200000',
    });
    const purchaseEvent1 = await utils.solidityEventPromise(crowdsale.Purchase());
    assert.equal(purchaseEvent1.args._addr, accounts[1], "Purchase event has wrong value on field '_addr'");
    assert(purchaseEvent1.args._ethers.eq(buyWeis[1]), "Purchase event has wrong value on field '_ethers'");
    assert(purchaseEvent1.args._coins.eq(buyCoins[1]), "Purchase event has wrong value on field '_coins'");
    const remaining2 = await like.balanceOf(crowdsale.address);
    assert(remaining1.sub(buyCoins[1]).eq(remaining2), 'Wrong remaining coins after accounts[1] buying coins');
    const account1Coins = await like.balanceOf(accounts[1]);
    assert(account1Coins.eq(buyCoins[1]), 'Wrong amount of coins given after accounts[1] buying coins');
    const registerKYCEvents = (await crowdsale.registerKYC([accounts[2], accounts[3], accounts[4]])).logs.filter(e => e.event === 'RegisterKYC');
    assert.equal(registerKYCEvents.length, 3, 'Wrong Number of RegisterKYC events');
    [2, 3, 4].forEach((accountIndex) => {
      const event = registerKYCEvents.filter(e => e.event === 'RegisterKYC' && e.args._addr === accounts[accountIndex]);
      assert.equal(event.length, 1, 'Wrong number of RegisterKYC events');
    });
    await web3.eth.sendTransaction({
      from: accounts[2],
      to: crowdsale.address,
      value: buyWeis[2],
      gas: '200000',
    });
    const purchaseEvent2 = await utils.solidityEventPromise(crowdsale.Purchase());
    assert.equal(purchaseEvent2.args._addr, accounts[2], "Purchase event has wrong value on field '_addr'");
    assert(purchaseEvent2.args._ethers.eq(buyWeis[2]), "Purchase event has wrong value on field '_ethers'");
    assert(purchaseEvent2.args._coins.eq(buyCoins[2]), "Purchase event has wrong value on field '_coins'");
    const remaining3 = await like.balanceOf(crowdsale.address);
    assert(remaining2.sub(buyCoins[2]).eq(remaining3), 'Wrong remaining coins after accounts[2] buying coins');
    const account2Coins = await like.balanceOf(accounts[2]);
    assert(account2Coins.eq(buyCoins[2]), 'Wrong amount of coins given after accounts[2] buying coins');
  });

  it('should forbid buying 0 coins', async () => {
    await crowdsale.registerKYC([accounts[7]]);
    await utils.assertSolidityThrow(async () => {
      await web3.eth.sendTransaction({
        from: accounts[7],
        to: crowdsale.address,
        value: 0,
        gas: '200000',
      });
    }, 'accounts[7] is buying 0 coins, which should be forbidden');
  });

  it('should forbid early finalization', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.finalize();
    }, 'Calling finalize before crowdsale ends should be forbidden');
  });

  it('should forbid buying coins after crowdsale ends', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    if (now < end) {
      await utils.testrpcIncreaseTime((end - now) + 1);
    }
    await utils.assertSolidityThrow(async () => {
      const remaining = await like.balanceOf(crowdsale.address);
      assert(!remaining.lt(coinsPerEth), 'Remaining coins is less than the value of 1 wei, please check test case');
      await web3.eth.sendTransaction({
        from: accounts[3],
        to: crowdsale.address,
        value: 1,
        gas: '200000',
      });
    }, 'Buying coins after crowdsale ends should be forbidden');
  });

  it('should forbid non-owner to call finalize', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.finalize({ from: accounts[1] });
    }, 'Calling finalize from non-owner should be forbidden');

    await crowdsale.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.finalize({ from: accounts[1] });
    }, 'Calling finalize from pending owner should be forbidden');

    await crowdsale.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.finalize({ from: accounts[0] });
    }, 'Calling finalize from old owner should be forbidden');

    // change back
    await crowdsale.transferOwnership(accounts[0], { from: accounts[1] });
    await crowdsale.claimOwnership({ from: accounts[0] });
  });

  it('should be able to transfer LIKE after crowdsale ends', async () => {
    const balanceBefore = await like.balanceOf(accounts[8]);
    const remainingBefore = await like.balanceOf(crowdsale.address);
    const callResult = await crowdsale.transferLike(accounts[8], 1, { from: accounts[0] });
    const likeTransferEvent = utils.solidityEvent(callResult, 'LikeTransfer');
    assert.equal(likeTransferEvent.args._to, accounts[8], "LikeTransfer event has wrong value on field '_to'");
    assert(likeTransferEvent.args._value.eq(1), "LikeTransfer event has wrong value on field '_value'");
    assert((await like.balanceOf(accounts[8])).eq(balanceBefore.add(1)), 'Value of Transferred balance is wrong');
    assert((await like.balanceOf(crowdsale.address)).eq(remainingBefore.sub(1)), 'Remaining balance is wrong');
  });

  it('should send ether to owner after finalization', async () => {
    const remaining = await like.balanceOf(crowdsale.address);
    assert(!remaining.eq(0), 'Remaining coins is 0, please check test case');
    const ownerBalance1 = web3.eth.getBalance(accounts[0]);
    const contractBalance1 = web3.eth.getBalance(crowdsale.address);
    utils.solidityEvent(await crowdsale.finalize({ gasPrice: 0 }), 'Finalize');
    const ownerBalance2 = web3.eth.getBalance(accounts[0]);
    const contractBalance2 = web3.eth.getBalance(crowdsale.address);
    assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), 'Wrong owner balance after finalization');
    assert(contractBalance2.eq(0), 'Wrong contract balance after finalization');
  });

  it('should forbid calling finalize more than once', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.finalize();
    }, 'Calling finalize more than once should be forbidden');
  });

  it('should forbid registering another crowdsale contract', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const anotherCrowdsale =
      await LikeCrowdsale.new(like.address, now + 10, now + 100, coinsPerEth);
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(anotherCrowdsale.address, hardCap, unlockTime);
    }, 'Registering another crowdsale contract should be forbidden');
  });

  it('should handle locking of private funds properly', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, unlockTime, 'Blocktime is already after unlock time, please adjust test case');
    await utils.assertSolidityThrow(async () => {
      await like.transfer(accounts[7], 101, { from: accounts[5] });
    }, 'should lock private fund until unlock time');
    await utils.testrpcIncreaseTime((unlockTime - now) + 1);
    await like.transfer(accounts[7], 101, { from: accounts[5] });
  });
});

contract('LikeCoin Crowdsale 2', (accounts) => {
  const privateFunds = {
    1: coinsToCoinUnits(100000000),
  };

  const buyCoins = {
    1: coinsToCoinUnits(795000000),
    2: coinsToCoinUnits(105000000),
  };

  const buyWeis = {
    1: buyCoins[1].div(coinsPerEth), // 31,800 Ether
    2: buyCoins[2].div(coinsPerEth), // 4,200 Ether
  };

  const oldCoinsPerEth = 10000;

  let unlockTime;
  let start;
  let end;
  let like;
  let crowdsale;

  before(async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    start = now + 1000;
    end = start + crowdsaleLength;
    unlockTime = now + 0xFFFFFFFF;
    like = await LikeCoin.new(0, 0x0, 0x0);
    crowdsale = await LikeCrowdsale.new(like.address, start, end, oldCoinsPerEth);
    await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
    await crowdsale.addPrivateFund(accounts[1], privateFunds[1]);
  });

  it('should change price', async () => {
    const callResult = await crowdsale.changePrice(coinsPerEth, { from: accounts[0] });
    const priceChangedEvent = utils.solidityEvent(callResult, 'PriceChanged');
    assert(priceChangedEvent.args._newPrice.eq(coinsPerEth), "PriceChanged event has wrong value on field '_newPrice'");

    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(coinsPerEth, { from: accounts[1] });
    }, 'Should not allow non-owner to change price');

    await crowdsale.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(coinsPerEth, { from: accounts[1] });
    }, 'Should not allow pending owner to change price');

    await crowdsale.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(coinsPerEth, { from: accounts[0] });
    }, 'Should not allow old owner to change price');

    // change back
    await crowdsale.transferOwnership(accounts[0], { from: accounts[1] });
    await crowdsale.claimOwnership({ from: accounts[0] });

    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(0, { from: accounts[0] });
    }, 'Should not allow new price to be 0');

    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((start - now) + 1);
    await crowdsale.registerKYC([accounts[1], accounts[2], accounts[3]]);
    await web3.eth.sendTransaction({
      from: accounts[1],
      to: crowdsale.address,
      value: buyWeis[1],
      gas: '200000',
    });

    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(coinsPerEth, { from: accounts[0] });
    }, 'Should not allow changing price after crowdsale start');
  });

  it('should forbid adding private fund after crowdsale started', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[3], 10000000);
    }, 'crowdsale has already started, adding private fund should be forbidden');
  });

  it('should forbid buying more coins than remaining', async () => {
    const remaining = await like.balanceOf(crowdsale.address);
    await utils.assertSolidityThrow(async () => {
      await web3.eth.sendTransaction({
        from: accounts[3],
        to: crowdsale.address,
        value: remaining.div(coinsPerEth).add(1),
        gas: '200000',
      });
    }, 'Buying more coins than remaining should be forbidden');
  });

  it('should allow buying exactly all remaining coins', async () => {
    await web3.eth.sendTransaction({
      from: accounts[2],
      to: crowdsale.address,
      value: buyWeis[2],
      gas: '200000',
    });
    assert((await like.balanceOf(crowdsale.address)).eq(0), 'Still have coins remaining, please adjust test case');
  });

  it('should forbid buying coins when no coin remains', async () => {
    await utils.assertSolidityThrow(async () => {
      await web3.eth.sendTransaction({
        from: accounts[2],
        to: crowdsale.address,
        value: 1,
        gas: '200000',
      });
    }, 'Should not be able to buy coins when no coin remains');
  });

  it('should allow crowdsale to end early when meeting hardCap', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, end, 'Blocktime is already after crowdsale end, please adjust test case');

    const ownerBalance1 = web3.eth.getBalance(accounts[0]);
    const contractBalance1 = web3.eth.getBalance(crowdsale.address);
    await crowdsale.finalize({ gasPrice: 0 });
    const ownerBalance2 = web3.eth.getBalance(accounts[0]);
    const contractBalance2 = web3.eth.getBalance(crowdsale.address);
    assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), 'Wrong owner balance after finalization');
    assert(contractBalance2.eq(0), 'Wrong contract balance after finalization');
  });
});

contract('LikeCoin Crowdsale operator', (accounts) => {
  let unlockTime;
  let start;
  let end;
  let like;
  let crowdsale;

  before(async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    start = now + 1000;
    end = start + crowdsaleLength;
    unlockTime = now + 0xFFFFFFFF;
    like = await LikeCoin.new(0, 0x0, 0x0);
    crowdsale = await LikeCrowdsale.new(like.address, start, end, 10000);
    await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
    await crowdsale.setOperator(accounts[1]);
  });

  it('should limit operator permission', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferOwnership(accounts[2], { from: accounts[1] });
    }, 'Should forbid operator to change owner');

    await utils.assertSolidityThrow(async () => {
      await crowdsale.setOperator(accounts[2], { from: accounts[1] });
    }, 'Should forbid operator to set operator');

    await utils.assertSolidityThrow(async () => {
      await crowdsale.changePrice(10001, { from: accounts[1] });
    }, 'Should forbid operator to change price');

    await utils.assertSolidityThrow(async () => {
      await crowdsale.addPrivateFund(accounts[2], 1, { from: accounts[1] });
    }, 'Should forbid operator to add private fund');

    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[2], 1, { from: accounts[1] });
    }, 'Should forbid operator to transfer LIKE');
  });

  it('should allow operator to register KYC', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, start, 'Blocktime is already after crowdsale start, please adjust test case');
    await utils.testrpcIncreaseTime((start - now) + 1);

    await crowdsale.registerKYC([accounts[2]], { from: accounts[1] });

    await crowdsale.setOperator(accounts[2]);

    await utils.assertSolidityThrow(async () => {
      await crowdsale.registerKYC([accounts[3]], { from: accounts[1] });
    }, 'Should forbid old operator to register KYC');

    await crowdsale.registerKYC([accounts[3], accounts[4], accounts[5]], { from: accounts[2] });
  });

  it('should allow operator to call finalize', async () => {
    await crowdsale.setOperator(accounts[1]);
    await crowdsale.registerKYC([accounts[0]]);
    await web3.eth.sendTransaction({
      from: accounts[0],
      to: crowdsale.address,
      value: 1,
      gas: '200000',
      gasPrice: 0,
    });

    const ownerBalanceBefore = web3.eth.getBalance(accounts[0]);
    const operatorBalanceBefore = web3.eth.getBalance(accounts[1]);

    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    assert.isBelow(now, end, 'Blocktime is already after crowdsale end, please adjust test case');
    await utils.testrpcIncreaseTime((end - now) + 1);

    await crowdsale.finalize({ from: accounts[1], gasPrice: 0 });

    assert(web3.eth.getBalance(accounts[0]).eq(ownerBalanceBefore.add(1)), 'Owner did not receive Ether correctly after finalize');
    assert(web3.eth.getBalance(accounts[1]).eq(operatorBalanceBefore), 'Operator should not receive Ether after finalize');
  });

  it('should limit operator permission', async () => {
    await utils.assertSolidityThrow(async () => {
      await crowdsale.transferLike(accounts[2], 1, { from: accounts[1] });
    }, 'Should forbid operator to transfer LIKE');
  });
});

contract('LikeCoin Crowdsale Overflow', () => {
  it('should forbid hardCap which will overflow', async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const cap = new BigNumber(2).pow(256).sub(1);
    const like = await LikeCoin.new(1, 0x0, 0x0);
    const crowdsale =
      await LikeCrowdsale.new(like.address, now + 100, now + 200, 1);
    await utils.assertSolidityThrow(async () => {
      await like.registerCrowdsales(crowdsale.address, cap, now + 300);
    }, 'Should forbid hardCap which will overflow');
  });
});

// vim: set ts=2 sw=2:
