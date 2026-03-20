'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

const LOG_FILE = path.join(__dirname, '..', '..', 'animated_import_log.txt');
function log(msg) {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
}

// Complete list of Disney/Pixar animated classics with Wikidata IDs
// These are the ORIGINAL animated versions, not live-action remakes
const ANIMATED_CLASSICS = [
    // Pixar
    { qid: 'Q171048',  title_en: 'Toy Story',                title_it: 'Toy Story',                       year: 1995, creator: 'John Lasseter', wiki_en: 'Toy_Story' },
    { qid: 'Q187278',  title_en: 'Toy Story 2',              title_it: 'Toy Story 2 - Woody e Buzz alla riscossa', year: 1999, creator: 'John Lasseter', wiki_en: 'Toy_Story_2' },
    { qid: 'Q187745',  title_en: 'Toy Story 3',              title_it: 'Toy Story 3 - La grande fuga',    year: 2010, creator: 'Lee Unkrich', wiki_en: 'Toy_Story_3' },
    { qid: 'Q18517232', title_en: 'Toy Story 4',             title_it: 'Toy Story 4',                     year: 2019, creator: 'Josh Cooley', wiki_en: 'Toy_Story_4' },
    { qid: 'Q132863',  title_en: 'Finding Nemo',             title_it: 'Alla ricerca di Nemo',             year: 2003, creator: 'Andrew Stanton', wiki_en: 'Finding_Nemo' },
    { qid: 'Q18640066', title_en: 'Finding Dory',            title_it: 'Alla ricerca di Dory',             year: 2016, creator: 'Andrew Stanton', wiki_en: 'Finding_Dory' },
    { qid: 'Q185239',  title_en: 'Monsters, Inc.',           title_it: 'Monsters & Co.',                   year: 2001, creator: 'Pete Docter', wiki_en: 'Monsters,_Inc.' },
    { qid: 'Q188439',  title_en: 'The Incredibles',          title_it: 'Gli Incredibili - Una famiglia di supereroi', year: 2004, creator: 'Brad Bird', wiki_en: 'The_Incredibles' },
    { qid: 'Q27040344', title_en: 'Incredibles 2',           title_it: 'Gli Incredibili 2',                year: 2018, creator: 'Brad Bird', wiki_en: 'Incredibles_2' },
    { qid: 'Q184843',  title_en: 'Ratatouille',              title_it: 'Ratatouille',                      year: 2007, creator: 'Brad Bird', wiki_en: 'Ratatouille_(film)' },
    { qid: 'Q104905',  title_en: 'WALL-E',                   title_it: 'WALL-E',                           year: 2008, creator: 'Andrew Stanton', wiki_en: 'WALL-E' },
    { qid: 'Q190050',  title_en: 'Up',                       title_it: 'Up',                               year: 2009, creator: 'Pete Docter', wiki_en: 'Up_(2009_film)' },
    { qid: 'Q25136411', title_en: 'Inside Out',              title_it: 'Inside Out',                       year: 2015, creator: 'Pete Docter', wiki_en: 'Inside_Out_(2015_film)' },
    { qid: 'Q60741600', title_en: 'Inside Out 2',            title_it: 'Inside Out 2',                     year: 2024, creator: 'Kelsey Mann', wiki_en: 'Inside_Out_2' },
    { qid: 'Q21034846', title_en: 'Coco',                    title_it: 'Coco',                             year: 2017, creator: 'Lee Unkrich', wiki_en: 'Coco_(2017_film)' },
    { qid: 'Q56553818', title_en: 'Soul',                    title_it: 'Soul',                             year: 2020, creator: 'Pete Docter', wiki_en: 'Soul_(2020_film)' },
    { qid: 'Q63985561', title_en: 'Luca',                    title_it: 'Luca',                             year: 2021, creator: 'Enrico Casarosa', wiki_en: 'Luca_(2021_film)' },
    { qid: 'Q73555138', title_en: 'Turning Red',             title_it: 'Red',                              year: 2022, creator: 'Domee Shi', wiki_en: 'Turning_Red' },
    { qid: 'Q67311529', title_en: 'Elemental',               title_it: 'Elemental',                        year: 2023, creator: 'Peter Sohn', wiki_en: 'Elemental_(2023_film)' },
    { qid: 'Q15270647', title_en: 'The Good Dinosaur',       title_it: 'Il viaggio di Arlo',               year: 2015, creator: 'Peter Sohn', wiki_en: 'The_Good_Dinosaur' },
    { qid: 'Q15079040', title_en: 'Lightyear',               title_it: 'Lightyear - La vera storia di Buzz', year: 2022, creator: 'Angus MacLane', wiki_en: 'Lightyear_(film)' },
    { qid: 'Q192838',  title_en: "A Bug's Life",             title_it: 'A Bug\'s Life - Megaminimondo',    year: 1998, creator: 'John Lasseter', wiki_en: 'A_Bug%27s_Life' },
    { qid: 'Q181795',  title_en: 'Cars',                     title_it: 'Cars - Motori ruggenti',           year: 2006, creator: 'John Lasseter', wiki_en: 'Cars_(film)' },
    { qid: 'Q27400',   title_en: 'Brave',                    title_it: 'Ribelle - The Brave',              year: 2012, creator: 'Mark Andrews', wiki_en: 'Brave_(2012_film)' },
    { qid: 'Q36479',   title_en: 'Onward',                   title_it: 'Onward - Oltre la magia',          year: 2020, creator: 'Dan Scanlon', wiki_en: 'Onward_(film)' },
    // Disney Animation Studios
    { qid: 'Q134773',  title_en: 'Frozen',                   title_it: 'Frozen - Il regno di ghiaccio',    year: 2013, creator: 'Chris Buck', wiki_en: 'Frozen_(2013_film)' },
    { qid: 'Q18328354', title_en: 'Frozen II',               title_it: 'Frozen II - Il segreto di Arendelle', year: 2019, creator: 'Chris Buck', wiki_en: 'Frozen_II' },
    { qid: 'Q36092',   title_en: 'The Lion King',            title_it: 'Il re leone',                      year: 1994, creator: 'Roger Allers', wiki_en: 'The_Lion_King' },
    { qid: 'Q189875',  title_en: 'Aladdin',                  title_it: 'Aladdin',                          year: 1992, creator: 'Ron Clements', wiki_en: 'Aladdin_(1992_film)' },
    { qid: 'Q272860',  title_en: 'Snow White and the Seven Dwarfs', title_it: 'Biancaneve e i sette nani', year: 1937, creator: 'David Hand', wiki_en: 'Snow_White_and_the_Seven_Dwarfs_(1937_film)' },
    { qid: 'Q189317',  title_en: 'The Little Mermaid',       title_it: 'La sirenetta',                     year: 1989, creator: 'Ron Clements', wiki_en: 'The_Little_Mermaid_(1989_film)' },
    { qid: 'Q188960',  title_en: 'Beauty and the Beast',     title_it: 'La bella e la bestia',             year: 1991, creator: 'Gary Trousdale', wiki_en: 'Beauty_and_the_Beast_(1991_film)' },
    { qid: 'Q271776',  title_en: 'Bambi',                    title_it: 'Bambi',                            year: 1942, creator: 'David Hand', wiki_en: 'Bambi_(film)' },
    { qid: 'Q189875',  title_en: 'Pinocchio',                title_it: 'Pinocchio',                        year: 1940, creator: 'Ben Sharpsteen', wiki_en: 'Pinocchio_(1940_film)' },
    { qid: 'Q190592',  title_en: 'Dumbo',                    title_it: 'Dumbo',                            year: 1941, creator: 'Ben Sharpsteen', wiki_en: 'Dumbo_(1941_film)' },
    { qid: 'Q192413',  title_en: 'Cinderella',               title_it: 'Cenerentola',                      year: 1950, creator: 'Clyde Geronimi', wiki_en: 'Cinderella_(1950_film)' },
    { qid: 'Q202735',  title_en: 'Mulan',                    title_it: 'Mulan',                            year: 1998, creator: 'Tony Bancroft', wiki_en: 'Mulan_(1998_film)' },
    { qid: 'Q210364',  title_en: 'Pocahontas',               title_it: 'Pocahontas',                       year: 1995, creator: 'Mike Gabriel', wiki_en: 'Pocahontas_(1995_film)' },
    { qid: 'Q171300',  title_en: 'Hercules',                 title_it: 'Hercules',                         year: 1997, creator: 'Ron Clements', wiki_en: 'Hercules_(1997_film)' },
    { qid: 'Q193695',  title_en: 'Tarzan',                   title_it: 'Tarzan',                           year: 1999, creator: 'Chris Buck', wiki_en: 'Tarzan_(1999_film)' },
    { qid: 'Q208696',  title_en: 'The Jungle Book',          title_it: 'Il libro della giungla',           year: 1967, creator: 'Wolfgang Reitherman', wiki_en: 'The_Jungle_Book_(1967_film)' },
    { qid: 'Q189081',  title_en: 'Peter Pan',                title_it: 'Le avventure di Peter Pan',        year: 1953, creator: 'Clyde Geronimi', wiki_en: 'Peter_Pan_(1953_film)' },
    { qid: 'Q196006',  title_en: 'Sleeping Beauty',          title_it: 'La bella addormentata nel bosco',  year: 1959, creator: 'Clyde Geronimi', wiki_en: 'Sleeping_Beauty_(1959_film)' },
    { qid: 'Q191818',  title_en: 'Alice in Wonderland',      title_it: 'Alice nel Paese delle Meraviglie', year: 1951, creator: 'Clyde Geronimi', wiki_en: 'Alice_in_Wonderland_(1951_film)' },
    { qid: 'Q192076',  title_en: '101 Dalmatians',           title_it: 'La carica dei 101',                year: 1961, creator: 'Clyde Geronimi', wiki_en: 'One_Hundred_and_One_Dalmatians' },
    { qid: 'Q196939',  title_en: 'Robin Hood',               title_it: 'Robin Hood',                       year: 1973, creator: 'Wolfgang Reitherman', wiki_en: 'Robin_Hood_(1973_film)' },
    { qid: 'Q224057',  title_en: 'Fantasia',                 title_it: 'Fantasia',                         year: 1940, creator: 'James Algar', wiki_en: 'Fantasia_(1940_film)' },
    { qid: 'Q201469',  title_en: 'Lady and the Tramp',       title_it: 'Lilli e il vagabondo',             year: 1955, creator: 'Clyde Geronimi', wiki_en: 'Lady_and_the_Tramp' },
    { qid: 'Q194100',  title_en: 'Tangled',                  title_it: 'Rapunzel - L\'intreccio della torre', year: 2010, creator: 'Nathan Greno', wiki_en: 'Tangled' },
    { qid: 'Q13360164', title_en: 'Big Hero 6',              title_it: 'Big Hero 6',                       year: 2014, creator: 'Don Hall', wiki_en: 'Big_Hero_6_(film)' },
    { qid: 'Q202008',  title_en: 'Wreck-It Ralph',           title_it: 'Ralph Spaccatutto',                year: 2012, creator: 'Rich Moore', wiki_en: 'Wreck-It_Ralph' },
    { qid: 'Q20001671', title_en: 'Zootopia',                title_it: 'Zootropolis',                      year: 2016, creator: 'Byron Howard', wiki_en: 'Zootopia' },
    { qid: 'Q17029944', title_en: 'Moana',                   title_it: 'Oceania',                          year: 2016, creator: 'Ron Clements', wiki_en: 'Moana_(2016_film)' },
    { qid: 'Q60808693', title_en: 'Encanto',                 title_it: 'Encanto',                          year: 2021, creator: 'Jared Bush', wiki_en: 'Encanto_(film)' },
    { qid: 'Q113466484', title_en: 'Wish',                   title_it: 'Wish',                             year: 2023, creator: 'Chris Buck', wiki_en: 'Wish_(film)' },
    // Jumanji (not Disney but relevant to board games!)
    { qid: 'Q190135',  title_en: 'Jumanji',                  title_it: 'Jumanji',                          year: 1995, creator: 'Joe Johnston', wiki_en: 'Jumanji' },
];

async function fetchPlot(wikiTitle, lang) {
    try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'InspireMe2-Bot/1.0' },
            signal: AbortSignal.timeout(10000)
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.extract || null;
    } catch { return null; }
}

async function fetchPlotIt(titleIt) {
    // Try multiple patterns for Italian Wikipedia
    for (const suffix of ['_(film)', '_(film_1995)', '_(film_2003)', '_(film_animato)', '']) {
        const plot = await fetchPlot(titleIt.replace(/ /g, '_') + suffix, 'it');
        if (plot && plot.length > 50) return plot;
    }
    return null;
}

async function importAll() {
    fs.writeFileSync(LOG_FILE, '');
    log('=== Import Animated Classics (Disney/Pixar) ===\n');

    const d = db.getDb();
    const existing = new Map();
    d.prepare('SELECT id, wikidata_id FROM works WHERE wikidata_id IS NOT NULL').all()
        .forEach(r => existing.set(r.wikidata_id, r.id));

    const insertWork = d.prepare(`
        INSERT INTO works (wikidata_id, type, title_it, title_en, creator, year, genres, sitelinks, country)
        VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPlot = d.prepare(`
        INSERT OR IGNORE INTO plots (work_id, source, language, plot_text)
        VALUES (?, 'wikipedia-api', ?, ?)
    `);

    let imported = 0, updated = 0, plots = 0;

    for (let i = 0; i < ANIMATED_CLASSICS.length; i++) {
        const f = ANIMATED_CLASSICS[i];
        log(`[${i + 1}/${ANIMATED_CLASSICS.length}] ${f.title_en} (${f.year})`);

        let workId;
        if (existing.has(f.qid)) {
            workId = existing.get(f.qid);
            log('  Already in DB (id=' + workId + '), checking plots...');
            updated++;
        } else {
            try {
                const genres = JSON.stringify(['animated film', 'family film', 'adventure film']);
                const info = insertWork.run(f.qid, f.title_it, f.title_en, f.creator, f.year, genres, 80, 'US');
                workId = info.lastInsertRowid;
                log('  Inserted new (id=' + workId + ')');
                imported++;
            } catch (e) {
                log('  ERROR inserting: ' + e.message);
                continue;
            }
        }

        // Check existing plots
        const existingPlots = d.prepare('SELECT language FROM plots WHERE work_id = ?').all(workId);
        const hasEn = existingPlots.some(p => p.language === 'en');
        const hasIt = existingPlots.some(p => p.language === 'it');

        // Fetch missing plots
        if (!hasEn) {
            const plotEn = await fetchPlot(f.wiki_en, 'en');
            if (plotEn && plotEn.length > 50) {
                insertPlot.run(workId, 'en', plotEn);
                log('  + Plot EN (' + plotEn.length + ' chars)');
                plots++;
            } else {
                log('  - No EN plot found');
            }
        } else {
            log('  = Plot EN exists');
        }

        if (!hasIt) {
            const plotIt = await fetchPlotIt(f.title_it);
            if (plotIt && plotIt.length > 50) {
                insertPlot.run(workId, 'it', plotIt);
                log('  + Plot IT (' + plotIt.length + ' chars)');
                plots++;
            } else {
                log('  - No IT plot found');
            }
        } else {
            log('  = Plot IT exists');
        }

        await new Promise(r => setTimeout(r, 300));
    }

    log('\n=== DONE ===');
    log('New: ' + imported + ', Updated: ' + updated + ', Plots added: ' + plots);
    db.close();
}

importAll().then(() => process.exit(0)).catch(e => { log('Fatal: ' + e.message); process.exit(1); });
