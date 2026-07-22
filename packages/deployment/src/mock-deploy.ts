import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { DeployAdapter, DeployRequest, DeployResult, randomToken } from "@ksp/shared";

/**
 * Mock deploy adapter: writes the bundle to var/deploys/<slug>/ and returns a fake
 * unguessable URL on a reserved domain. Lets the whole pipeline (and the dashboard's
 * preview links) work offline.
 */
export class MockDeployAdapter implements DeployAdapter {
  readonly source = "mock-deploy";

  constructor(private readonly deployRoot: string) {}

  async deploy(req: DeployRequest): Promise<DeployResult> {
    const siteId = `mock-site-${req.slug}`;
    const dir = path.join(this.deployRoot, req.slug);
    for (const [name, content] of Object.entries(req.files)) {
      const target = path.join(dir, name.replace(/^\//, ""));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return {
      deploymentId: `mock-deploy-${randomToken()}`,
      siteId,
      url: `https://${req.slug}.netlify.example/`,
      logs: `mock deploy written to ${dir}`,
    };
  }

  async replace(siteId: string, files: Record<string, string | Buffer>): Promise<DeployResult> {
    const slug = siteId.replace(/^mock-site-/, "");
    const dir = path.join(this.deployRoot, slug);
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(dir, name.replace(/^\//, ""));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return {
      deploymentId: `mock-deploy-${randomToken()}`,
      siteId,
      url: `https://${slug}.netlify.example/`,
      logs: `mock replace written to ${dir}`,
    };
  }

  async delete(siteId: string): Promise<void> {
    const slug = siteId.replace(/^mock-site-/, "");
    await rm(path.join(this.deployRoot, slug), { recursive: true, force: true });
  }
}
