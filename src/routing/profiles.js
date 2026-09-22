const global = `---context:global
assign processUnusedTags = true
assign validForFoot = true
assign downhillcost = 0
assign downhillcutoff = 1.5
assign uphillcost = 0
assign uphillcutoff = 1.5
assign turnInstructionMode = 1

---context:way
assign turncost = 0
assign initialclassifier = 0
assign initialcost = 0
assign defaultaccess
  switch access=
    ( if motorroad=yes then false
      else if highway=motorway|motorway_link then false
      else true )
    switch or access=private access=no false true
assign footaccess
  switch foot=
    defaultaccess
    not or foot=private or foot=no foot=use_sidepath
assign accesspenalty switch footaccess 0 100000
`;

const node = `
assign priorityclassifier = 0
assign classifiermask = 0

---context:node
assign defaultaccess
  switch access= 1 switch or access=private access=no 0 1
assign footaccess
  switch foot= defaultaccess switch or foot=private foot=no 0 1
assign initialcost switch footaccess 0 1000000
`;

function profile(costRules) {
  return `${global}\nassign costfactor\n  add accesspenalty\n  ${costRules}\n${node}`;
}

export const ROUTE_PROFILES = {
  A: profile(`if highway=footway|pedestrian then 1
  else if highway=path then 1.1
  else if highway=track then 1.5
  else if highway=cycleway then 4
  else if highway=steps then 10000
  else if highway=living_street then 5
  else if highway=residential|service|unclassified then 8
  else if highway=tertiary|tertiary_link then 20
  else if highway=secondary|secondary_link then 40
  else if highway=primary|primary_link|trunk|trunk_link then 80
  else if route=ferry then 100
  else 10`),
  B: profile(`if highway=footway|pedestrian|path then 1
  else if highway=cycleway then 1.2
  else if highway=track then 1.4
  else if highway=steps then 3
  else if highway=living_street then 3
  else if highway=residential|service|unclassified then 5
  else if highway=tertiary|tertiary_link then 12
  else if highway=secondary|secondary_link then 25
  else if highway=primary|primary_link|trunk|trunk_link then 50
  else if route=ferry then 100
  else 8`),
  C: profile(`if highway=motorway|motorway_link|proposed|abandoned|construction then 100000
  else if route=ferry then 5.67
  else 1`)
};
