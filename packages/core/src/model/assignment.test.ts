import { describe, expect, test } from "bun:test"

import { isOpenAssignment, type AssignmentState } from "./assignment.ts"

const accepted = { outcome: "accepted" }

const open = (state: AssignmentState, acceptance: unknown = null) =>
  isOpenAssignment({ state, acceptance })

describe("isOpenAssignment", () => {
  test("counts Ready, Running and unaccepted Succeeded Assignments", () => {
    expect(open("Ready")).toBe(true)
    expect(open("Running")).toBe(true)
    expect(open("Succeeded")).toBe(true)
  })

  test("leaves out accepted, Failed and Cancelled Assignments", () => {
    expect(open("Succeeded", accepted)).toBe(false)
    expect(open("Failed")).toBe(false)
    expect(open("Cancelled")).toBe(false)
  })
})
