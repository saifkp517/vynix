import fs from "fs";
import path from "path"

const baseDir = '../../coding-problems'

interface Categories {
    [folderName: string]: string[];
}

const sanitizeName = (name: string) => name.replace(/'/g, '');

const categorizeProblems = (dir: string) => {
    const categories: Categories = {};

    const folders = fs.readdirSync(dir, { withFileTypes: true });

    folders.forEach((folder) => {
        if (folder.isDirectory()) {
            const folderPath = path.join(dir, folder.name);

            const problems = fs.readdirSync(folderPath).filter(file => file.endsWith('.py'));

            categories[folder.name] = problems;

        }


    })

    return categories;
}

const categorizedData = categorizeProblems(baseDir);


const readFirstFileInCategory = (category: string, categories: Categories) => {
    // const categories = categorizeProblems(baseDir);

    if (!categories[category] || categories[category].length === 0) {
        console.log(`No files found in category: ${category}`);
        return;
    }

    const firstFile = categories[category][0];
    const filePath = path.join(baseDir, category, firstFile);

    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`Contents of ${firstFile} in ${category} category:\n`);
    console.log(content);
};


// fs.writeFileSync('problems.json', JSON.stringify(categorizedData, null, 2));
// console.log('done')
readFirstFileInCategory('Arrays', categorizedData);