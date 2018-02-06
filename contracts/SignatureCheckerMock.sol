//    Copyright (C) 2018 LikeCoin Foundation Limited
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

import "./SignatureChecker.sol";

contract SignatureCheckerMock {
    function checkTransferDelegated(
        address, address, uint256, uint256, uint256 _nonce, bytes
    ) public pure returns (bool) {
        return _nonce < 10;
    }

    function checkTransferAndCallDelegated(
        address, address, uint256, bytes, uint256, uint256 _nonce, bytes
    ) public pure returns (bool) {
        return _nonce < 10;
    }

    function checkTransferMultipleDelegated(
        address, address[], uint256[], uint256, uint256 _nonce, bytes
    ) public pure returns (bool) {
        return _nonce < 10;
    }
}
