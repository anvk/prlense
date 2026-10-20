import { test } from "node:test"
import assert from "node:assert/strict"
import { ghRepoArg, parseRemoteUrl, pickRemote, slugFromRemoteUrl, type Remote } from "./remotes.js"

test("slugFromRemoteUrl handles ssh, https and ssh:// forms", () => {
  assert.equal(slugFromRemoteUrl("git@github.com:acme/shop.git"), "acme/shop")
  assert.equal(slugFromRemoteUrl("https://github.com/acme/shop"), "acme/shop")
  assert.equal(slugFromRemoteUrl("https://github.com/acme/shop.git/"), "acme/shop")
  assert.equal(slugFromRemoteUrl("ssh://git@github.com/acme/shop.git"), "acme/shop")
  assert.equal(slugFromRemoteUrl("not a url"), null)
})

const remotes: Remote[] = [
  { name: "origin", url: "", slug: "acme/legacy-shop", host: "github.com" },
  { name: "newOrigin", url: "", slug: "acme/shop", host: "github.com" },
]

test("pickRemote prefers the flag, then the URL slug, then a sole remote", () => {
  assert.equal(pickRemote(remotes, { remoteFlag: "newOrigin" }).name, "newOrigin")
  assert.equal(pickRemote(remotes, { urlSlug: "Acme/SHOP" }).name, "newOrigin")
  assert.equal(pickRemote([remotes[1]], {}).name, "newOrigin")
})

test("pickRemote refuses to guess", () => {
  assert.throws(() => pickRemote(remotes, {}), /ambiguous/)
  assert.throws(() => pickRemote(remotes, { urlSlug: "someone/else" }), /only has remotes/)
  assert.throws(() => pickRemote(remotes, { remoteFlag: "nope" }), /No remote named/)
})

test("remotes on a GitHub Enterprise host keep it, and gh is given it", () => {
  assert.deepEqual(parseRemoteUrl("git@git.acme.dev:shop/web.git"), { host: "git.acme.dev", slug: "shop/web" })
  assert.deepEqual(parseRemoteUrl("ssh://git@git.acme.dev:2222/shop/web.git"), { host: "git.acme.dev", slug: "shop/web" })
  assert.deepEqual(parseRemoteUrl("https://GitHub.com/acme/shop"), { host: "github.com", slug: "acme/shop" })
  assert.equal(ghRepoArg({ host: "github.com", slug: "acme/shop" }), "acme/shop")
  assert.equal(ghRepoArg({ host: "git.acme.dev", slug: "shop/web" }), "git.acme.dev/shop/web")
})
