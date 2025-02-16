import { PinataSDK } from "pinata-web3";

const pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY_URL!,
});

export const uploadJson = async (name: string, description: string) => {
    const { IpfsHash } = await pinata.upload.json({
        name,
        description,
    });
    return IpfsHash;
};
