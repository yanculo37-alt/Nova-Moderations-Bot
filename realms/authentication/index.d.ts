import { KeyObject } from 'crypto'

declare module 'prismarine-auth' {
  export class Authflow {

    username: string

    options: MicrosoftAuthFlowOptions

    constructor(username?: string, cache?: string | CacheFactory, options?: MicrosoftAuthFlowOptions, codeCallback?: (res: ServerDeviceCodeResponse) => void)

    getMsaToken(): Promise<string>

    getXboxToken(relyingParty?: string, forceRefresh?: boolean): Promise<{
      userXUID: string,
      userHash: string,
      XSTSToken: string,
      expiresOn: number
    }>

    getMinecraftBedrockToken(publicKey: KeyObject): Promise<string>

    getMinecraftBedrockServicesToken(config: { version: string }): Promise<GetMinecraftBedrockServicesResponse>

    getPlayfabLogin(): Promise<GetPlayfabLoginResponse>

  }

  export interface MicrosoftAuthFlowOptions {

    authTitle?: Titles
    deviceType?: string
    deviceVersion?: string
    flow: 'live' | 'sisu'

    forceRefresh?: boolean
  }

  export enum Titles {
    MinecraftNintendoSwitch = '00000000441cc96b',
    MinecraftPlaystation = '000000004827c78e',
    MinecraftAndroid = '0000000048183522',
    MinecraftJava = '00000000402b5328',
    MinecraftIOS = '000000004c17c01a',
    XboxAppIOS = '000000004c12ae6f',
    XboxGamepassIOS = '000000004c20a908'
  }

  export enum RelyingParty {
    PCXSTSRelyingParty = 'rp://api.minecraftservices.com/',
    BedrockXSTSRelyingParty = 'https://multiplayer.minecraft.net/',
    XboxAuthRelyingParty = 'http://auth.xboxlive.com/',
    XboxRelyingParty = 'http://xboxlive.com'
  }

  type ServerDeviceCodeResponse = {
      user_code: string
      device_code: string
      verification_uri: string
      expires_in: number
      interval: number
      message: string
  }

  export interface Cache {
    reset(): Promise<void>
    getCached(): Promise<any>
    setCached(value: any): Promise<void>
    setCachedPartial(value: any): Promise<void>
  }

  export type CacheFactory = (options: { username: string, cacheName: string }) => Cache

  export type GetMinecraftBedrockServicesResponse = {
    mcToken: string
    validUntil: string
    treatments: string[]
    treatmentContext: string
    configurations: object
  }

  export type GetPlayfabLoginResponse = {
    SessionTicket: string;
    PlayFabId: string;
    NewlyCreated: boolean;
    SettingsForUser: {
        NeedsAttribution: boolean;
        GatherDeviceInfo: boolean;
        GatherFocusInfo: boolean;
    };
    LastLoginTime: string;
    InfoResultPayload: {
        AccountInfo: {
            PlayFabId: string;
            Created: string;
            TitleInfo: {
                Origination: string;
                Created: string;
                LastLogin: string;
                FirstLogin: string;
                isBanned: boolean;
                TitlePlayerAccount: {
                    Id: string;
                    Type: string;
                    TypeString: string;
                };
            };
            PrivateInfo: Record<string, unknown>;
            XboxInfo: {
                XboxUserId: string;
                XboxUserSandbox: string;
            };
        };
        UserInventory: any[];
        UserDataVersion: number;
        UserReadOnlyDataVersion: number;
        CharacterInventories: any[];
        PlayerProfile: {
            PublisherId: string;
            TitleId: string;
            PlayerId: string;
        };
    };
    EntityToken: {
        EntityToken: string;
        TokenExpiration: string;
        Entity: {
            Id: string;
            Type: string;
            TypeString: string;
        };
    };
    TreatmentAssignment: {
        Variants: any[];
        Variables: any[];
    };
  }
}