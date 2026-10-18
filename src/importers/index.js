import spring from './spring.js';

export const importers = [spring];

export const findImporter = id => importers.find(i => i.id === id) || null;

export const importerFor = file => importers.find(i => i.extensions.some(ext => file.toLowerCase().endsWith(ext))) || null;

export const describeImporters = () => importers.map(({ run, ...meta }) => meta);
