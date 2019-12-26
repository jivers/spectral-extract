const { extractSpectrum } = require("../spectral-extract.js");

const args = process.argv
                        .filter((x, i) => i > 1)
                        .reduce((acc, x, i) => {
                            switch (i) {
                                case 0:
                                    acc.filePath = x;
                                    break;
                                case 1:
                                    acc.filterLow = x;
                                    break;
                                case 2:
                                    acc.filterHigh = x;
                                case 3:
                                    acc.threshold = x;
                                    break;
                                case 4:
                                    acc.outputDir = x;
                                    break;   
                            }
                            return acc;
                        }, {});

const main = async (args) => {
    console.log(args);
    const { filePath, filterLow, filterHigh, threshold, outputDir } = args;

    await extractSpectrum(filePath, {
        mode: "single",
        frequencyFilters: [[filterLow, filterHigh]],
        threshold: threshold,
        outputDir: outputDir
    });
};

main(args);