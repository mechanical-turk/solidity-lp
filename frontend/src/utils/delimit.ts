import { BigNumber } from "ethers";

export const delimit = (num: BigNumber) => {
  const s = num.toString();
  const groups = [[]];
  for (let i = s.length - 1; i >= 0; i--) {
    if (groups[0].length === 3) {
      groups.unshift([]);
    }

    groups[0].unshift(s.charAt(i));
  }
  const firstPhase = groups.map((g) => g.join(""));
  const secondPhase = firstPhase.join("_");
  return secondPhase;
};
