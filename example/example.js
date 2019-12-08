
const { extractSpectrum } = require("../spectral-extract.js");

const main = async () => {
    await extractSpectrum("example.wav", {
        mode: "multi",
        frequencyFilters: [[50, 100], [200, 300], [350, 400]],
        threshold: -50,
        outputDir: "out"
    });
};

main();