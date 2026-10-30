import { seed } from './seed.js';

const res = seed({ force: process.argv.includes('--force') });
console.log('seed:', res);
