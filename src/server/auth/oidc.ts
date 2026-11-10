import * as oidc from "openid-client";
import type { AdminConfig } from "../config";
import { AdminError } from "../errors";
export type OidcRequest = { state: string; nonce: string; verifier: string };
export class GoogleOidc {
  private configuration?: Promise<oidc.Configuration>;
  constructor(
    private config: AdminConfig,
    private factory = () =>
      oidc.discovery(
        new URL("https://accounts.google.com"),
        config.oidcClientId,
        config.oidcClientSecret,
        oidc.ClientSecretPost(config.oidcClientSecret),
        { timeout: 3 },
      ),
  ) {}
  private client() {
    return (this.configuration ??= this.factory());
  }
  async start() {
    const values = {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        verifier: oidc.randomPKCECodeVerifier(),
      },
      c = await this.client();
    return {
      values,
      url: oidc.buildAuthorizationUrl(c, {
        scope: "openid email",
        redirect_uri: this.config.origin + "/api/admin/v1/auth/callback",
        state: values.state,
        nonce: values.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(values.verifier),
        code_challenge_method: "S256",
        prompt: "select_account",
      }).href,
    };
  }
  async complete(url: URL, values: OidcRequest) {
    try {
      if (
        url.origin !== this.config.origin ||
        url.pathname !== "/api/admin/v1/auth/callback"
      )
        throw Error("invalid_callback");
      const result = await oidc.authorizationCodeGrant(
        await this.client(),
        url,
        {
          pkceCodeVerifier: values.verifier,
          expectedState: values.state,
          expectedNonce: values.nonce,
          idTokenExpected: true,
        },
      );
      const c = result.claims();
      if (
        !c ||
        typeof c.sub !== "string" ||
        typeof c.email !== "string" ||
        c.email_verified !== true
      )
        throw new AdminError(403, "identity_denied");
      return { subject: c.sub, email: c.email.toLowerCase() };
    } catch (e) {
      if (e instanceof AdminError) throw e;
      throw new AdminError(401, "identity_invalid");
    }
  }
}
