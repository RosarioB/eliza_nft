import {
    IAgentRuntime,
    Memory,
    Evaluator,
    ModelClass,
    elizaLogger,
    generateObjectDeprecated,
} from "@elizaos/core";
import { uploadJson } from "./pinata";
import { mintNft } from "./viem";

export interface NftData {
    name: string | undefined;
    description: string | undefined;
    recipient: string | undefined;
    lastUpdated: number | undefined;
}

export const emptyNftData: NftData = {
    name: undefined,
    description: undefined,
    recipient: undefined,
    lastUpdated: undefined,
};

export interface MintTxData {
    txHash: string | undefined;
    lastUpdated: number | undefined;
}

export const emptyMintTx: MintTxData = {
    txHash: undefined,
    lastUpdated: undefined,
};

const getCacheKey = (runtime: IAgentRuntime, userId: string): string => {
    return `${runtime.character.name}/${userId}/data`;
};

const getMissingFields = (
    data: NftData
): Array<keyof Omit<NftData, "lastUpdated">> => {
    const fields: Array<keyof Omit<NftData, "lastUpdated">> = [
        "name",
        "description",
        "recipient",
    ];
    return fields.filter((field) => !data[field]);
};

export const isDataComplete = (data: NftData): boolean => {
    return getMissingFields(data).length === 0;
};

export const nftDataEvaluator: Evaluator = {
    name: "GET_NFT_DATA",
    similes: [
        "EXTRACT_NFT_INFO",
        "GET_NFT_INFORMATION",
        "COLLECT_NFT_DATA",
        "NFT_DETAILS",
    ],
    description:
        "Extract the NFT's name, description, and recipient (an Ethereum address) from the conversation when explicitly mentioned.",
    alwaysRun: true,

    validate: async (
        runtime: IAgentRuntime,
        message: Memory
    ): Promise<boolean> => {
        try {
            const cacheKey = getCacheKey(runtime, message.userId);
            const cachedData = (await runtime.cacheManager.get<NftData>(
                cacheKey
            )) || { ...emptyNftData };
            return !isDataComplete(cachedData);
        } catch (error) {
            elizaLogger.error("Error in nftDataEvaluator validate:", error);
            return false;
        }
    },

    handler: async (runtime: IAgentRuntime, message: Memory): Promise<void> => {
        try {
            const cacheKey = getCacheKey(runtime, message.userId);
            const cachedData = (await runtime.cacheManager.get<NftData>(
                cacheKey
            )) || { ...emptyNftData };

            const cachedMintTx = (await runtime.cacheManager.get<MintTxData>(
                cacheKey
            )) || { ...emptyMintTx };

            const extractionTemplate = `
                Analyze the following conversation to extract NFT information.
                Only extract information when it is explicitly and clearly stated by the user about themselves.

                Conversation:
                ${message.content.text}

                Return a JSON object containing only the fields where information was clearly found:
                {
                    "name": "extracted NFT's name if stated",
                            "description": "extracted NFT's description if stated",
                            "recipient": "extracted Ethereum address of the NFT's recipient if stated"
                }

                Only include fields where information is explicitly stated and current.
                Omit fields if information is unclear, hypothetical, or about others.
                `;

            const extractedInfo = await generateObjectDeprecated({
                runtime,
                context: extractionTemplate,
                modelClass: ModelClass.SMALL,
            });

            let dataUpdated = false;

            for (const field of ["name", "description", "recipient"] as const) {
                if (extractedInfo[field] && cachedData[field] === undefined) {
                    cachedData[field] = extractedInfo[field];
                    dataUpdated = true;
                }
            }

            if (dataUpdated) {
                cachedData.lastUpdated = Date.now();
                await runtime.cacheManager.set(cacheKey, cachedData, {
                    expires: Date.now() + 10 * 60 * 1000, // 10 minutes cache
                });
            }

            if (isDataComplete(cachedData)) {
                elizaLogger.success(
                    "NFT data collection completed:",
                    cachedData
                );

                const dataIpfsHash = await uploadJson(
                    cachedData.name,
                    cachedData.description
                );
                elizaLogger.success(
                    `Uploaded JSON to IPFS with hash: ${dataIpfsHash}`
                );
                const dataIpfsUrl = `ipfs://${dataIpfsHash}`;
                const mintTxHash = await mintNft(
                    cachedData.recipient,
                    dataIpfsUrl
                );
                elizaLogger.success(
                    `Minted NFT with transaction hash: ${mintTxHash}`
                );
                cachedMintTx.lastUpdated = Date.now();
                cachedMintTx.txHash = mintTxHash;
                await runtime.cacheManager.set(cacheKey, cachedMintTx, {
                    expires: Date.now() + 10 * 60 * 1000, // 10 minutes cache
                });
            }
        } catch (error) {
            elizaLogger.error("Error in nftDataEvaluator handler:", error);
        }
    },

    examples: [
        {
            context: "NFT creation",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: `Hi everyone! I want to create a new NFT called Maserati GranTurismo
                                with this description: A luxurious grand tourer powered by a high-revving V8 engine, combining Italian elegance with dynamic performance.
                                It offers an exhilarating driving experience, refined craftsmanship, and timeless design.
                                I want the NFT to be sent to the address 0x20c6F9006d563240031A1388f4f25726029a6368`,
                    },
                },
            ],
            outcome: `[{
                "name": "Maserati GranTurismo",
                "description": "A luxurious grand tourer powered by a high-revving V8 engine, combining Italian elegance with dynamic performance.
                                It offers an exhilarating driving experience, refined craftsmanship, and timeless design.",
                "recipient": "0x20c6F9006d563240031A1388f4f25726029a6368"
            }]`,
        },
        {
            context: "Purchase discussion",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "I plan to buy a new Maserati GranTurismo next year.",
                    },
                },
            ],
            outcome: "{}",
        },
        {
            context: "NFT portfolio discussion",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "I already own many NFTs in my wallet 0x20c6F9006d563240031A1388f4f25726029a6368",
                    },
                },
            ],
            outcome: "{}",
        },
    ],
};
