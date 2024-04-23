type PassportIDToken = {
  header: { alg: "RS256"; typ: "JWT"; kid: "3aaYytdwwe032s1r3TIr9" };
  payload: {
    passport: {
      zkevm_eth_address: string;
      zkevm_user_admin_address: string;
    };
    given_name: string;
    family_name: string;
    nickname: string;
    name: string;
    picture: string;
    locale: string;
    updated_at: string;
    email: string;
    email_verified: boolean;
    iss: string;
    aud: string;
    iat: number;
    exp: number;
    sub: string;
    sid: string;
  };
  signature: string;
};

interface NFTMetadata {
  image: string;
  name: string;
  description: string;
  attributes: Attribute[];
}

interface Attribute {
  trait_type: string;
  value: string;
}
