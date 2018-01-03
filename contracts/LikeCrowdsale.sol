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

pragma solidity ^0.4.18;

import "./LikeCoin.sol";

contract LikeCrowdsale {
    address public owner = 0x0;
    address public newOwner = 0x0;
    LikeCoin public like = LikeCoin(0x0);
    uint public start = 0;
    uint public end = 0;
    uint256 public coinsPerEth = 0;
    uint256 public hardCap = 0;
    uint256 public referrerBonusPercent = 0;

    mapping (address => bool) public kycDone;
    mapping (address => address) public referrer;

    bool privateFundFinalized = false;
    bool finalized = false;

    event OwnershipChanged(address _newOwner);
    event AddPrivateFund(address indexed _addr, uint256 _value);
    event FinalizePrivateFund();
    event RegisterKYC(address indexed _addr);
    event RegisterReferrer(address indexed _addr, address indexed _referrer);
    event Purchase(address indexed _addr, uint256 _ethers, uint256 _coins);
    event ReferrerBonus(address indexed _referrer, address indexed _buyer, uint256 _bonus);
    event Finalize();

    function LikeCrowdsale(address _likeAddr, uint _start, uint _end, uint256 _coinsPerEth, uint256 _hardCap, uint8 _referrerBonusPercent) public {
        require(_hardCap != 0);
        require(_coinsPerEth != 0);
        require(_referrerBonusPercent != 0);
        owner = msg.sender;
        like = LikeCoin(_likeAddr);
        start = _start;
        end = _end;
        coinsPerEth = _coinsPerEth;
        hardCap = _hardCap;
        referrerBonusPercent = _referrerBonusPercent;
    }

    function changeOwner(address _newOwner) public {
        require(msg.sender == owner);
        newOwner = _newOwner;
    }

    function acceptOwnership() public {
        require(msg.sender == newOwner);
        owner = newOwner;
        newOwner = 0x0;
        OwnershipChanged(owner);
    }

    function isPrivateFundFinalized() public constant returns (bool) {
        return privateFundFinalized || now >= start;
    }

    function addPrivateFund(address _addr, uint256 _value) public {
        require(msg.sender == owner);
        require(!isPrivateFundFinalized());
        require(_value > 0);
        require(like.balanceOf(this) >= _value);
        like.transferAndLock(_addr, _value);
        AddPrivateFund(_addr, _value);
    }

    function finalizePrivateFund() public {
        require(msg.sender == owner);
        privateFundFinalized = true;
        FinalizePrivateFund();
    }

    function registerKYC(address[] _customerAddrs) public {
        require(msg.sender == owner);
        for (uint32 i = 0; i < _customerAddrs.length; ++i) {
            kycDone[_customerAddrs[i]] = true;
            RegisterKYC(_customerAddrs[i]);
        }
    }

    function registerReferrer(address _addr, address _referrer) public {
        require(msg.sender == owner);
        require(referrer[_addr] == 0x0);
        referrer[_addr] = _referrer;
        RegisterReferrer(_addr, _referrer);
    }

    function () public payable {
        require(now >= start);
        require(now < end);
        require(like.balanceOf(this) > 0);
        require(msg.value > 0);
        require(kycDone[msg.sender]);
        uint256 coins = coinsPerEth * msg.value;
        require(coins / msg.value == coinsPerEth);
        like.transfer(msg.sender, coins);
        Purchase(msg.sender, msg.value, coins);
        if (referrer[msg.sender] != 0x0) {
            uint256 bonusEnlarged = coins * referrerBonusPercent;
            require(bonusEnlarged / referrerBonusPercent == coins);
            uint256 bonus = bonusEnlarged / 100;
            like.transfer(referrer[msg.sender], bonus);
            ReferrerBonus(referrer[msg.sender], msg.sender, bonus);
        }
    }

    function finalize() public {
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
        Finalize();
    }
}
