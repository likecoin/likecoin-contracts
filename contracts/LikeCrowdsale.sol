pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract LikeCrowdsale {
    address public owner;
    LikeCoin public like;
    uint public start;
    uint public end;
    uint256 public coinsPerEth;
    uint256 public hardCap;
    bool public privateFundFinalized = false;
    uint8 public referrerBonusPercent;

    mapping (address => bool) public kycDone;
    mapping (address => address) public referrer;

    bool finalized = false;

    function LikeCrowdsale(address _likeAddr, uint _start, uint _end, uint256 _coinsPerEth, uint256 _hardCap, uint8 _referrerBonusPercent) {
        owner = msg.sender;
        like = LikeCoin(_likeAddr);
        start = _start;
        end = _end;
        coinsPerEth = _coinsPerEth;
        hardCap = _hardCap;
        referrerBonusPercent = _referrerBonusPercent;
    }

    function addPrivateFund(address _addr, uint256 _value) {
        require(msg.sender == owner);
        require(now < start);
        require(!privateFundFinalized);
        require(_value > 0);
        require(like.balanceOf(this) >= _value);
        like.transferAndLock(_addr, _value);
    }

    function finalizePrivateFund() {
        require(msg.sender == owner);
        privateFundFinalized = true;
    }

    function registerKYC(address[] _customerAddrs) {
        require(msg.sender == owner);
        for (uint32 i = 0; i < _customerAddrs.length; i++) {
            kycDone[_customerAddrs[i]] = true;
        }
    }

    function registerReferrer(address _addr, address _referrer) {
        require(msg.sender == owner);
        require(referrer[_addr] == 0x0);
        referrer[_addr] = _referrer;
    }

    function () payable {
        require(now >= start);
        require(now < end);
        require(like.balanceOf(this) > 0);
        require(msg.value > 0);
        require(kycDone[msg.sender]);
        // TODO safe maths?
        uint256 coins = coinsPerEth * msg.value;
        like.transfer(msg.sender, coins);
        if (referrer[msg.sender] != 0x0) {
            like.transfer(referrer[msg.sender], coins * referrerBonusPercent / 100);
        }
    }

    function finalize() {
        require(!finalized);
        require(msg.sender == owner);
        require(now >= start);
        uint256 remainingCoins = like.balanceOf(this);
        require(now >= end || remainingCoins == 0);
        owner.transfer(this.balance);
        if (remainingCoins != 0) {
            like.burn(remainingCoins);
        }
        finalized = true;
    }
}
