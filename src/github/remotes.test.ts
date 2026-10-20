import { test } from "node:test"
import assert from "node:assert/strict"
import { pickRemote, slugFromRemoteUrl, type Remote } from "./remotes.js"

test("slugFromRemoteUrl handles ssh, https and ssh:// forms", () => {
  assert.equal(slugFromRemoteUrl("git@github.com:acme/shop.git"), "acme/shop")
  assert.equal(slugFromRemoteUrl("https://github.com/acme/shop"), "acme/shop")
  assert.equal(slugFromRemoteUrl("https://github.com/acme/shop.git/"), "acme/shop")
  assert.equal(slugFromRemoteUrl("ssh://git@github.com/acme/shop.git"), "acme/shop")
  assert.equal(slugFromRemoteUrl("not a url"), null)
})

const remotes: Remote[] = [
  { name: "origin", url: "", slug: "acme/legacy-shop" },
  { name: "newOrigin", url: "", slug: "acme/shop" },
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
