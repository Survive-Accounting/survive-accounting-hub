import { describe, expect, test } from "bun:test";

import {
  DEFAULT_FIELD, PHONE, cameraAt, cameraRect, defaultShots, emptyCluster, fitCamera, nodeSteps, overviewCamera, parseClusterSpec, visibleAt,
  type ClusterSpec,
} from "./cluster-spec";

const spec: ClusterSpec = {
  version: 1, id: "map-1", title: "Buy supplies on account", field: { ...DEFAULT_FIELD },
  nodes: [
    { id: "eq", x: 300, y: 200, w: 900, h: 400, title: "A = L + E", data: { kind: "equation", arrows: { assets: "up", liabilities: "up", equity: "none" }, caption: "Supplies on account" } },
    { id: "je", x: 300, y: 800, w: 900, h: 500, data: { kind: "je", description: "Bought supplies on account", lines: [{ account: "Supplies", dr: 500, type: "A" }, { account: "Accounts Payable", cr: 500, type: "L" }] } },
    { id: "t1", x: 300, y: 1500, w: 420, h: 420, data: { kind: "taccount", account: "Supplies", normal: "dr", fromNodes: ["je"] } },
    { id: "types", x: 1300, y: 200, w: 700, h: 1200, data: { kind: "accounts", revealBy: "group", groups: [{ label: "Assets", accounts: ["Cash", "Supplies"] }, { label: "Liabilities", accounts: ["Accounts Payable"] }] } },
  ],
  edges: [{ from: "je", to: "t1", kind: "post" }],
  shots: [
    { id: "s1", camera: { x: 750, y: 400, zoom: 1 }, reveal: ["eq"] },
    { id: "s2", camera: { x: 750, y: 1050, zoom: 0.9 }, reveal: ["je#1"] },
    { id: "s3", camera: { x: 750, y: 1050, zoom: 0.9 }, reveal: ["je#3"] },
    { id: "s4", camera: { x: 750, y: 1200, zoom: 0.7 }, reveal: ["je", "t1"] },
    { id: "s5", camera: { x: 1650, y: 800, zoom: 0.8 }, reveal: ["types#1"] },
  ],
};

describe("cluster spec", () => {
  test("parses a well-formed spec and rejects a dangling edge", () => {
    expect(parseClusterSpec(spec).error).toBeNull();
    const bad = { ...spec, edges: [{ from: "je", to: "nowhere", kind: "post" }] };
    expect(parseClusterSpec(bad).error).toMatch(/nowhere/);
    expect(parseClusterSpec({ ...spec, nodes: [spec.nodes[0], spec.nodes[0]] }).error).toMatch(/share an id/);
  });
  test("a bad node kind names the path", () => {
    const r = parseClusterSpec({ ...spec, nodes: [{ id: "x", x: 0, y: 0, w: 10, h: 10, data: { kind: "molecule" } }] });
    expect(r.spec).toBeNull();
    expect(r.error).toMatch(/nodes\.0\.data/);
  });
  test("emptyCluster is valid and has the default field", () => {
    const e = emptyCluster("Test");
    expect(parseClusterSpec(e).error).toBeNull();
    expect(e.field).toEqual(DEFAULT_FIELD);
  });
});

describe("steps and reveal", () => {
  test("an entry reveals description then account and amount per line; a list by group", () => {
    expect(nodeSteps(spec.nodes[1])).toBe(5);
    expect(nodeSteps(spec.nodes[3])).toBe(2);
    expect(nodeSteps(spec.nodes[0])).toBe(1);
  });
  test("visibleAt is cumulative and clamps partial reveals to the node's step count", () => {
    const v2 = visibleAt(spec, 2);
    expect([...v2.nodes]).toEqual(["eq", "je"]);
    expect(v2.steps.get("je")).toBe(3);
    const v3 = visibleAt(spec, 3);
    expect(v3.steps.get("je")).toBe(5);
    expect(v3.nodes.has("t1")).toBe(true);
    const v4 = visibleAt(spec, 4);
    expect(v4.steps.get("types")).toBe(1);
    expect(visibleAt({ ...spec, shots: [{ id: "s", camera: { x: 0, y: 0, zoom: 1 }, reveal: ["je#99"] }] }, 0).steps.get("je")).toBe(5);
  });
  test("an unknown id in reveal is ignored", () => {
    const v = visibleAt({ ...spec, shots: [{ id: "s", camera: { x: 0, y: 0, zoom: 1 }, reveal: ["ghost", "eq"] }] }, 0);
    expect([...v.nodes]).toEqual(["eq"]);
  });
});

describe("cameras", () => {
  test("fitCamera centres the node and never zooms past 1", () => {
    const cam = fitCamera({ x: 300, y: 200, w: 900, h: 400 });
    expect(cam.x).toBe(750); expect(cam.y).toBe(400);
    expect(cam.zoom).toBeLessThanOrEqual(1);
    const tiny = fitCamera({ x: 0, y: 0, w: 100, h: 100 });
    expect(tiny.zoom).toBe(1);
  });
  test("the overview shows the whole field inside the phone", () => {
    const cam = overviewCamera(DEFAULT_FIELD);
    const r = cameraRect(cam);
    expect(r.w).toBeGreaterThanOrEqual(DEFAULT_FIELD.w - 1);
    expect(r.h).toBeGreaterThanOrEqual(DEFAULT_FIELD.h - 1);
    expect(cam.zoom).toBe(0.5);
  });
  test("cameraRect is the phone divided by zoom, centred on the camera", () => {
    const r = cameraRect({ x: 1000, y: 1000, zoom: 0.5 });
    expect(r).toEqual({ x: 1000 - PHONE.w, y: 1000 - PHONE.h, w: PHONE.w * 2, h: PHONE.h * 2 });
  });
  test("defaultShots frames each node in order, revealing cumulatively; cameraAt clamps", () => {
    const shots = defaultShots(spec);
    expect(shots.length).toBe(4);
    expect(shots[2].reveal).toEqual(["eq", "je", "t1"]);
    expect(cameraAt(spec, 99)).toEqual(spec.shots[4].camera);
    expect(cameraAt({ ...spec, shots: [] }, 1).x).toBe(spec.nodes[1].x + spec.nodes[1].w / 2);
    expect(cameraAt({ ...spec, nodes: [], shots: [] }, 0)).toEqual(overviewCamera(spec.field));
  });
});
