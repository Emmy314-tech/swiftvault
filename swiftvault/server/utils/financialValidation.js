export const isPositiveFiniteAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
};

export const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;