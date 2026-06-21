const startups = require("./startups.json");

module.exports = () => {
  const cities = new Set(startups.map((s) => s.location));
  const sectors = new Set(startups.map((s) => s.sector));
  return {
    total: startups.length,
    cities: cities.size,
    sectors: sectors.size,
  };
};
