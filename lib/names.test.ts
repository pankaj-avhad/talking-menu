import assert from "node:assert/strict"
import { test } from "node:test"

import { formatUsd, mentionsAmount, spokenUsd } from "@/lib/money"
import { matchName, nameKey, soundKey } from "@/lib/names"

const customer = (name: string) => ({ name, nameKey: nameKey(name) })

test("names match regardless of case and accents", () => {
  const stored = [customer("Priya"), customer("José")]
  assert.equal(matchName("priya", stored)?.kind, "exact")
  assert.equal(matchName("Jose", stored)?.customer.name, "José")
})

test("small slips and sound-alikes are close matches, to be confirmed", () => {
  const stored = [customer("Pankaj")]
  assert.equal(matchName("Pankja", stored)?.kind, "close")
  assert.equal(soundKey("Pun Cudge"), soundKey("Pankaj"))
  assert.equal(matchName("Pun Cudge", stored)?.kind, "close")
  assert.equal(matchName("Pankaj Avhad", stored)?.kind, "close")
})

test("different names don't match", () => {
  const stored = [customer("Priya"), customer("Sam")]
  assert.equal(matchName("Priyanka", stored), null)
  assert.equal(matchName("Pam", stored), null)
})

test("money is formatted for the screen and for speech", () => {
  assert.equal(formatUsd(1575), "$15.75")
  assert.equal(spokenUsd(1575), "fifteen dollars and seventy-five cents")
  assert.equal(spokenUsd(3100), "thirty-one dollars")
  assert.equal(spokenUsd(101), "one dollar and one cent")
  assert.equal(spokenUsd(0), "zero dollars")
  assert.equal(spokenUsd(123456), "one thousand two hundred thirty-four dollars and fifty-six cents")
})

test("a spoken total is recognised however it's said", () => {
  assert.ok(mentionsAmount("The total comes to fifty-three thirty.", 5330))
  assert.ok(mentionsAmount("That's $53.30 in total", 5330))
  assert.ok(mentionsAmount("fifty-three dollars and thirty cents", 5330))
  assert.ok(mentionsAmount("It's one Thai Iced Tea for five fifty.", 550))
  assert.ok(mentionsAmount("twelve oh five", 1205))
  assert.ok(mentionsAmount("sixteen dollars", 1600))
  assert.ok(!mentionsAmount("The total comes to fifty-three twenty.", 5330))
})

test("the name is picked out of the caller's reply", async () => {
  const { nameFromSpeech, sameName } = await import("@/lib/names")
  assert.equal(nameFromSpeech("Hi. This is Priya."), "Priya")
  assert.equal(nameFromSpeech("Hi, it's Priya again."), "Priya")
  assert.equal(nameFromSpeech("My name is Pankaj Avhad, thanks"), "Pankaj Avhad")
  assert.equal(nameFromSpeech("Sam."), "Sam")
  assert.equal(nameFromSpeech("Yes."), null)
  assert.equal(nameFromSpeech("Can I get two Hue Rolls?"), null)
  assert.ok(sameName("Pankaj", "Pun Cudge"))
  assert.ok(sameName("Priya", "priya sharma"))
  assert.ok(!sameName("Freya", "Priya"))
  assert.ok(!sameName("Tri", "Priya"))
})
