// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ArcTestnetFaucet} from "../contracts/ArcTestnetFaucet.sol";

contract DeployEurcScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address eurcToken = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
        uint256 claimAmount = 50_000_000; // 50 EURC (6 decimals) - REDUCED FROM 100 TO 50
        uint256 cooldown = 86_400; // 24 hours

        vm.startBroadcast(deployerPrivateKey);

        ArcTestnetFaucet faucet = new ArcTestnetFaucet(
            eurcToken,
            claimAmount,
            cooldown
        );

        vm.stopBroadcast();

        console.log("EURC Faucet deployed at:", address(faucet));
    }
}

