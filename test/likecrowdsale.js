/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const LikeCrowdsale = artifacts.require("./LikeCrowdsale.sol");

const decimalFactor = new BigNumber(10).pow(18);

function coinsToCoinUnits(value) {
    return decimalFactor.times(value);
}

const softCap = coinsToCoinUnits(100000000);
const hardCap = coinsToCoinUnits(1000000000);
const coinsPerEth = 25000;
const crowdsaleLength = 60 * 60 * 24 * 7;

contract("LikeCoin Normal Crowdsale", (accounts) => {
    const privateFunds = {
        5: coinsToCoinUnits(10000000),
        6: coinsToCoinUnits(12000000)
    };

    const buyCoins = {
        1: coinsToCoinUnits(25000),
        2: coinsToCoinUnits(8000000),
        3: coinsToCoinUnits(7000000),
        4: coinsToCoinUnits(62975000)
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth),
        2: buyCoins[2].div(coinsPerEth),
        3: buyCoins[3].div(coinsPerEth),
        4: buyCoins[4].div(coinsPerEth)
    };

    const unlockTime = 0x7FFFFFFF;
    let start;
    let end;
    let like;
    let crowdsale;

    before(async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        like = await LikeCoin.new(0, 0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, softCap, hardCap);
    });

    it("should deploy the crowdsale contract correctly", async () => {
        assert.equal(await crowdsale.owner(), accounts[0], `LikeCrowdsale contract has wrong owner`);
        assert.equal(await crowdsale.start(), start, `LikeCrowdsale contract has wrong start`);
        assert.equal(await crowdsale.end(), end, `LikeCrowdsale contract has wrong end`);
        assert.equal((await crowdsale.coinsPerEth()).toNumber(), coinsPerEth, `LikeCrowdsale contract has wrong coinsPerEth`);
        assert((await crowdsale.softCap()).eq(softCap), `Likerowdsale1 contract has wrong softCap`);
        assert((await crowdsale.hardCap()).eq(hardCap), `LikeCrowdsale contract has wrong hardCap`);
        assert((await crowdsale.remainingCoins()).eq(hardCap), `LikeCrowdsale contract has wrong remainingCoins`);
        assert.equal(await crowdsale.success(), false, `LikeCrowdsale contract has wrong success`);
        assert.equal(await crowdsale.privateFundFinalized(), false, `LikeCrowdsale contract has wrong privateFundFinalized`);
    });

    it("should forbid non-owner to register crowdsale contract", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, {from: accounts[1]});
        }, "should forbid accounts[1] to register crowdsale contract");
    });

    it(`should mint ${hardCap.toFixed()} units of coins`, async () => {
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        const supply = await like.totalSupply();
        assert(supply.eq(hardCap), `${hardCap.toFixed()} units of coins should be minted`);
    });

    it(`should give the crowdsale contract ${hardCap.toFixed()} units of coins`, async () => {
        const balance = await like.balanceOf(crowdsale.address);
        assert(balance.eq(hardCap), `The crowdsale contract should own ${hardCap.toFixed()} units of coins`);
    });

    it("should add private fund correctly", async () => {
        const remaining1 = await crowdsale.remainingCoins();
        await crowdsale.addPrivateFund(accounts[5], privateFunds[5]);
        const remaining2 = await crowdsale.remainingCoins();
        assert(remaining1.sub(privateFunds[5]).eq(remaining2), "Wrong remaining coins after adding private fund");
        await crowdsale.addPrivateFund(accounts[6], privateFunds[6]);
        const remaining3 = await crowdsale.remainingCoins();
        assert(remaining2.sub(privateFunds[6]).eq(remaining3), "Wrong remaining coins after adding private fund");
    });

    it("should forbid adding private fund for the same account multiple times", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[5], privateFunds[5]);
        }, "should forbid adding private fund for the second time on accounts[5]");
    });

    it("should forbid adding private fund more than remaining coins", async () => {
        await utils.assertSolidityThrow(async () => {
            const remaining = await crowdsale.remainingCoins();
            await crowdsale.addPrivateFund(accounts[7], remaining.add(1));
        }, "should forbid adding private fund more than remaining coins");
    });

    it("should forbid non-owner to add private fund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], 100000, {from: accounts[1]});
        }, "should forbid adding private fund from accounts[1]");
    });

    it("should forbid non-owner to finalize private fund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalizePrivateFund({from: accounts[1]});
        }, "should forbid finalizing private fund from accounts[1]");
    });

    it("should forbid adding private fund after finalizing private fund", async () => {
        const finalizeFlag1 = await crowdsale.privateFundFinalized();
        assert.equal(finalizeFlag1, false, "Finalize flag is already set before finalizing private fund, please adjust test case");
        await crowdsale.finalizePrivateFund();
        const finalizeFlag2 = await crowdsale.privateFundFinalized();
        assert.equal(finalizeFlag2, true, "Finalize flag should be not set");
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], 100000);
        }, "should forbid adding private fund after finalizing private fund");
    });

    it("should forbid buying coins before crowdsale starts", async () => {
        await crowdsale.registerKYC(accounts[1]);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, start, "Blocktime is already after crowdsale start, please adjust test case");
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        }, "Buying coins before crowdsale starts should be forbidden");
    });

    it("should forbid buying coins before KYC", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 10 - now);
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        }, "Buying coins before KYC should be forbidden");
    });

    it("should allow buying coins after KYC", async () => {
        const remaining1 = await crowdsale.remainingCoins();
        await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        const remaining2 = await crowdsale.remainingCoins();
        assert(remaining1.sub(buyCoins[1]).eq(remaining2), "Wrong remaining coins after accounts[1] buying coins");
        await crowdsale.registerKYC(accounts[2]);
        await crowdsale.registerKYC(accounts[3]);
        await crowdsale.registerKYC(accounts[4]);
        await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        const remaining3 = await crowdsale.remainingCoins();
        assert(remaining2.sub(buyCoins[2]).eq(remaining3), "Wrong remaining coins after accounts[2] buying coins");
        await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
        const remaining4 = await crowdsale.remainingCoins();
        assert(remaining3.sub(buyCoins[3]).eq(remaining4), "Wrong remaining coins after accounts[3] buying coins");
        await web3.eth.sendTransaction({ from: accounts[4], to: crowdsale.address, value: buyWeis[4] });
        const remaining5 = await crowdsale.remainingCoins();
        assert(remaining4.sub(buyCoins[4]).eq(remaining5), "Wrong remaining coins after accounts[4] buying coins");
    });

    it("should forbid buying 0 coins", async () => {
        await crowdsale.registerKYC(accounts[7]);
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[7], to: crowdsale.address, value: 0 });
        }, "accounts[7] is buying 0 coins, which should be forbidden");
    });

    it("should forbid early finalization", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize();
        }, "Calling finalize before crowdsale ends should be forbidden");
    });

    it("should forbid buying coins after crowdsale ends", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        if (now < end) {
            await utils.testrpcIncreaseTime(end + 10 - now);
        }
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
        }, "Buying coins after crowdsale ends should be forbidden");
    });

    it("should send coins to users when calling getCoinOrRefund", async () => {
        for (let i = 1; i <= 6; i++) {
            assert.equal((await like.balanceOf(accounts[i])).toNumber(), 0, `accounts[${i}] should not have coins before calling getCoinOrRefund`);
        }
        const contractWei1 = web3.eth.getBalance(crowdsale.address);
        for (let i = 1; i <= 4; i++) {
            await crowdsale.getCoinOrRefund({from: accounts[i]});
            assert((await like.balanceOf(accounts[i])).eq(buyCoins[i]), `accounts[${i}] should get coins after calling getCoinOrRefund`);
        }
        await crowdsale.getCoinOrRefund({from: accounts[5]});
        assert((await like.balanceOf(accounts[5])).eq(privateFunds[5]), "accounts[5] should get coins after calling getCoinOrRefund");
        await crowdsale.getCoinOrRefund({from: accounts[6]});
        assert((await like.balanceOf(accounts[6])).eq(privateFunds[6]), "accounts[6] should get coins after calling getCoinOrRefund");
        const contractWei2 = web3.eth.getBalance(crowdsale.address);
        assert(contractWei1.eq(contractWei2), "Contract should not lose any ether");
    });

    it("should forbid calling getCoinOrRefund more than once", async () => {
        for (let i = 1; i <= 6; i++) {
            await utils.assertSolidityThrow(async () => {
                await crowdsale.getCoinOrRefund({from: accounts[i]});
            }, `Calling getCoinOrRefund from accounts[${i}] more than once should be forbidden`);
        }
    });

    it("should forbid user who did not buy coin to call getCoinOrRefund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.getCoinOrRefund({from: accounts[7]});
        }, "accounts[7] did not buy any coin, should not be able to call getCoinOrRefund");
    });

    it("should forbid non-owner to call finalize", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize({from: accounts[1]});
        }, "Calling finalize from non-owner should be forbidden");
    });

    it("should send ether to owner after finalization", async () => {
        const ownerBalance1 = web3.eth.getBalance(accounts[0]);
        const contractBalance1 = web3.eth.getBalance(crowdsale.address);
        await crowdsale.finalize({gasPrice: 0});
        const ownerBalance2 = web3.eth.getBalance(accounts[0]);
        const contractBalance2 = web3.eth.getBalance(crowdsale.address);
        assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), "Wrong owner balance after finalization");
        assert.equal(contractBalance2.toNumber(), 0, "Wrong contract balance after finalization");
    });

    it("should burn remaining coins", async () => {
        assert.equal((await crowdsale.remainingCoins()).toNumber(), 0, "No coins should remain in the crowdsale contract");
        assert.equal((await like.balanceOf(crowdsale.address)).toNumber(), 0, "No coins should remain in the crowdsale contract");
        const sold = buyCoins[1].add(buyCoins[2]).add(buyCoins[3]).add(buyCoins[4]).add(privateFunds[5]).add(privateFunds[6]);
        assert((await like.totalSupply()).eq(sold), "Wrong remaining LikeCoin total supply");
    });

    it("should forbid calling finalize more than once", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize();
        }, "Calling finalize more than once should be forbidden");
    });

    it("should set success flag to true", async () => {
        const successFlag = await crowdsale.success();
        assert.equal(successFlag, true, "Success flag should be set to true");
    });

    it("should forbid registering another crowdsale contract", async () => {
        const anotherCrowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, softCap, hardCap);
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(anotherCrowdsale.address, hardCap, unlockTime);
        },"Registering another crowdsale contract should be forbidden");
    });
});

contract("LikeCoin EpicFail Crowdsale", (accounts) => {
    const privateFunds = {
        5: coinsToCoinUnits(10000000),
    };

    const buyCoins = {
        1: coinsToCoinUnits(25000),
        2: coinsToCoinUnits(8000000),
        3: coinsToCoinUnits(7000000),
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth),
        2: buyCoins[2].div(coinsPerEth),
        3: buyCoins[3].div(coinsPerEth),
    };

    const unlockTime = 0x7FFFFFFF;
    let start;
    let end;
    let like;
    let crowdsale;

    before(async () => {
        await utils.testrpcIncreaseTime(1);
        let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        like = await LikeCoin.new(0, 0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, softCap, hardCap);
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        await crowdsale.registerKYC(accounts[1]);
        await crowdsale.registerKYC(accounts[2]);
        await crowdsale.registerKYC(accounts[3]);
        await crowdsale.addPrivateFund(accounts[5], privateFunds[5]);
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 10 - now);
        await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
    });

    it("should forbid adding private fund after crowdsale started", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[6], 100000);
        }, "should forbid adding private fund after crowdsale started");
    });

    it("should keep all ethers when finalizing after crowdsale failed", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(end + 10 - now);
        const ownerBalance1 = web3.eth.getBalance(accounts[0]);
        const contractBalance1 = web3.eth.getBalance(crowdsale.address);
        await crowdsale.finalize({gasPrice: 0});
        const ownerBalance2 = web3.eth.getBalance(accounts[0]);
        const contractBalance2 = web3.eth.getBalance(crowdsale.address);
        assert(ownerBalance2.eq(ownerBalance1), "Wrong owner balance after finalization");
        assert(contractBalance2.eq(contractBalance1), "Wrong contract balance after finalization");
    });

    it("should burn all coins", async () => {
        assert.equal((await crowdsale.remainingCoins()).toNumber(), 0, "No coins should remain in the crowdsale contract");
        assert.equal((await like.balanceOf(crowdsale.address)).toNumber(), 0, "No coins should remain in the crowdsale contract");
        assert.equal((await like.totalSupply()).toNumber(), 0, "No LikeCoin supply should remain");
    });

    it("should set success flag to false", async () => {
        const successFlag = await crowdsale.success();
        assert.equal(successFlag, false, "Success flag should be set to false");
    });

    it("should refund ether to crowdsale users when calling getCoinOrRefund", async () => {
        for (let i = 1; i <= 3; i++) {
            const userWei1 = web3.eth.getBalance(accounts[i]);
            const etherSpent = await crowdsale.etherSpent(accounts[i]);
            await crowdsale.getCoinOrRefund({from: accounts[i], gasPrice: 0});
            const userWei2 = web3.eth.getBalance(accounts[i]);
            assert(userWei2.gt(userWei1), `accounts[${i}] should get refund after calling getCoinOrRefund`);
            assert(userWei2.eq(userWei1.add(etherSpent)), `accounts[${i}] should get refund after calling getCoinOrRefund`);
            assert.equal((await like.balanceOf(accounts[i])).toNumber(), 0, `accounts[${i}] should not have coins after refund`);
        }
    });

    it("should forbid private fund investor to call getCoinOrRefund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.getCoinOrRefund({from: accounts[5]});
        }, "Calling getCoinOrRefund from private fund investor accounts[5] should be forbidden");
    });

    it("should forbid calling getCoinOrRefund more than once", async () => {
        for (let i = 1; i <= 3; i++) {
            await utils.assertSolidityThrow(async () => {
                await crowdsale.getCoinOrRefund({from: accounts[i]});
            }, `Calling getCoinOrRefund from accounts[${i}] more than once should be forbidden`);
        }
    });

    it("should forbid user who did not buy coin to call getCoinOrRefund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.getCoinOrRefund({from: accounts[7]});
        }, "accounts[7] did not buy any coin, should not be able to call getCoinOrRefund");
    });
});

contract("LikeCoin TooGoodToBeTrue Crowdsale", (accounts) => {
    const privateFunds = {
        5: coinsToCoinUnits(20000000),
        6: coinsToCoinUnits(30000000),
    };

    const buyCoins = {
        1: coinsToCoinUnits(100000000),
        2: coinsToCoinUnits(200000000),
        3: coinsToCoinUnits(300000000),
        4: coinsToCoinUnits(350000000),
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth),
        2: buyCoins[2].div(coinsPerEth),
        3: buyCoins[3].div(coinsPerEth),
        4: buyCoins[4].div(coinsPerEth),
    };

    const unlockTime = 0x7FFFFFFF;
    let start;
    let end;
    let like;
    let crowdsale;

    before(async () => {
        await utils.testrpcIncreaseTime(1);
        let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        like = await LikeCoin.new(0, 0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, softCap, hardCap);
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        await crowdsale.registerKYC(accounts[1]);
        await crowdsale.registerKYC(accounts[2]);
        await crowdsale.registerKYC(accounts[3]);
        await crowdsale.registerKYC(accounts[4]);
        await crowdsale.addPrivateFund(accounts[5], privateFunds[5]);
        await crowdsale.addPrivateFund(accounts[6], privateFunds[6]);
        await crowdsale.finalizePrivateFund();
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 10 - now);
        await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
    });

    it("should forbid buying more coins than remaining", async () => {
        const remaining = await crowdsale.remainingCoins();
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[4], to: crowdsale.address, value: remaining.div(coinsPerEth).add(1) });
        }, "Buying more coins than remaining should be forbidden");
    });

    it("should allow buying exactly all remaining coins", async () => {
        await web3.eth.sendTransaction({ from: accounts[4], to: crowdsale.address, value: buyWeis[4] });
        assert.equal((await crowdsale.remainingCoins()).toNumber(), 0, "Still have coins remaining, please adjust test case");
    });

    it("should allow crowdsale to end early when meeting hardCap", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, end, "Blocktime is already after crowdsale end, please adjust test case");
        await crowdsale.getCoinOrRefund({from: accounts[1]});
        await crowdsale.getCoinOrRefund({from: accounts[2]});
        await crowdsale.getCoinOrRefund({from: accounts[3]});
        await crowdsale.finalize();
        await crowdsale.getCoinOrRefund({from: accounts[4]});
        await crowdsale.getCoinOrRefund({from: accounts[5]});
        await crowdsale.getCoinOrRefund({from: accounts[6]});
    });
});
