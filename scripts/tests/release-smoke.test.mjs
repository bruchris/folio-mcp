import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../release-smoke.mjs', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
function configuredVendors() {
  let config;
  try { config = JSON.parse(readFileSync(join(repository, 'release.config.json'), 'utf8')); }
  catch { assert.fail('The smoke test requires valid explicit release configuration.'); }
  assert.equal(config.appSourceVisibility, 'private');
  if (config.publicationScope === 'private-workspace') {
    assert.equal(config.repository, 'bruchris/freddy');
    return ['folio', 'fiken'];
  }
  assert.equal(config.publicationScope, 'vendor-mcp');
  assert.ok(['folio', 'fiken'].includes(config.vendor));
  assert.equal(config.repository, `bruchris/${config.vendor}-mcp`);
  return [config.vendor];
}
function runSmoke(context, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, signal: context.signal });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject); child.on('close', (code, signal) => resolve({ code, signal, output }));
  });
}
function assertPassed(result, vendors) {
  assert.equal(result.code, 0, 'Configured package smoke failed; diagnostic payloads withheld.');
  for (const vendor of ['folio', 'fiken']) {
    const marker = `@bruchris/${vendor}-mcp: tarball, isolated install, client, CLI, MCP passed`;
    assert.equal(result.output.includes(marker), vendors.includes(vendor), 'Smoke must verify exactly the configured vendors.');
  }
  assert.ok(result.output.includes('Release smoke passed; no vendor network requests.'));
}
async function fixture(config, check) {
  const root = mkdtempSync(join(tmpdir(), 'freddy-smoke-selection-'));
  const canonical = realpathSync(root);
  const write = (path, value) => writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  try {
    if (config !== undefined) write('release.config.json', config);
    write('package.json', { name: 'synthetic-smoke-workspace', private: true, workspaces: config?.publicationScope === 'private-workspace' ? ['packages/*'] : [`packages/${config?.vendor ?? 'folio'}-mcp`] });
    await check({ root, write });
  } finally {
    assert.equal(realpathSync(root), canonical, 'Temporary directory changed; cleanup refused.');
    const rel = relative(realpathSync(tmpdir()), canonical);
    assert.ok(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'Cleanup escaped the test temporary directory.');
    rmSync(canonical, { recursive: true, force: true });
  }
}
function vendorConfig(vendor) { return { publicationScope: 'vendor-mcp', vendor, repository: `bruchris/${vendor}-mcp`, appSourceVisibility: 'private' }; }

// Build every configured package before exercising its actual installed surface.
test('configured tarballs install cleanly and expose clients, safe CLI commands, and MCP tools', { timeout: 360_000 }, async context => {
  assertPassed(await runSmoke(context), configuredVendors());
});

test('smoke requires explicit configuration and never skips missing or wrong selected manifests', { timeout: 360_000 }, async context => {
  for (const config of [undefined, {publicationScope:'mcp-only',repository:'bruchris/freddy-mcp',appSourceVisibility:'private'}]) {
    await fixture(config, async ({root}) => {
      const result=await runSmoke(context,['--root',root]);
      assert.equal(result.code,1,'Missing or ambiguous scope must fail before packing.');
      assert.match(result.output,/configuration|release.config|scope/i);
    });
  }
  for(const vendor of ['folio','fiken']) {
    await fixture(vendorConfig(vendor),async({root})=>{
      const result=await runSmoke(context,['--root',root]);
      assert.equal(result.code,1,'The selected manifest must exist.');assert.match(result.output,/manifest/i);
    });
    await fixture(vendorConfig(vendor),async({root})=>{
      const path=join(root,'packages',vendor+'-mcp');mkdirSync(path,{recursive:true});
      writeFileSync(join(path,'package.json'),JSON.stringify({name:`@bruchris/${vendor==='folio'?'fiken':'folio'}-mcp`}));
      const result=await runSmoke(context,['--root',root]);
      assert.equal(result.code,1,'The selected manifest must have the correct package identity.');assert.match(result.output,/manifest/i);
    });
  }
  await fixture({publicationScope:'private-workspace',repository:'bruchris/freddy',appSourceVisibility:'private'},async({root})=>{
    const path=join(root,'packages','folio-mcp');mkdirSync(join(path,'dist'),{recursive:true});
    writeFileSync(join(path,'package.json'),JSON.stringify({name:'@bruchris/folio-mcp'}));writeFileSync(join(path,'dist/client.js'),'');
    const result=await runSmoke(context,['--root',root]);
    assert.equal(result.code,1,'Private-workspace smoke must require both packages.');assert.match(result.output,/manifest/i);
  });
});

test('a standalone vendor smoke installs only its configured package with no sibling checkout', { timeout: 360_000 }, async context => {
  for(const vendor of configuredVendors()) await fixture(vendorConfig(vendor),async({root})=>{
    const source=join(repository,'packages',vendor+'-mcp');const target=join(root,'packages',vendor+'-mcp');
    mkdirSync(target,{recursive:true});
    for(const file of ['package.json','README.md','LICENSE']) copyFileSync(join(source,file),join(target,file));
    cpSync(join(source,'dist'),join(target,'dist'),{recursive:true});
    assertPassed(await runSmoke(context,['--root',root]),[vendor]);
  });
});