import {
    createPublicClient,
    createWalletClient,
    http,
    parseAbi,
    publicActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, baseSepolia } from "viem/chains";
import { normalize } from "viem/ens";

const DEPLOYED_CONTRACT_ADDRESS = "0xDe552b9Ef4028d1B5f06203Fa25c3D1Fc5945785"; // Base Sepolia

const erc721Abi = parseAbi([
    "function safeMint(address to, string memory uri) public",
]);

const account = privateKeyToAccount(
    process.env.EVM_PRIVATE_KEY as `0x${string}`
);

const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.ETHEREUM_PROVIDER_ARBITRUMSEPOLIA),
}).extend(publicActions);

const publicClientMainnet = createPublicClient({
    chain: mainnet,
    transport: http(),
});

const resolveAddress = async (address: string) => {
    let resolvedAddress = address;
    if (address.endsWith(".eth")) {
        resolvedAddress = await publicClientMainnet.getEnsAddress({
            name: normalize(address),
        });
    }
    return resolvedAddress;
};

export const mintNft = async (recipient: string, uri: string) => {
    const address = await resolveAddress(recipient) as `0x${string}`;
    const txHash = await walletClient.writeContract({
        address: DEPLOYED_CONTRACT_ADDRESS,
        abi: erc721Abi,
        functionName: "safeMint",
        args: [address, uri],
        chain: baseSepolia,
        account: account,
    });
    return txHash;
};
