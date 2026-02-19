// Widget build script using esbuild
import { build } from 'esbuild';
import fs from 'fs-extra';

async function buildWidget() {
    await fs.ensureDir('widget/dist');

    await build({
        entryPoints: ['widget/widget.js'],
        bundle: true,
        minify: true,
        outfile: 'widget/dist/widget.min.js',
        format: 'iife',
        target: ['es2018']
    });

    // Copy unminified version too
    await fs.copy('widget/widget.js', 'widget/dist/widget.js');

    console.log('✅ Widget built successfully → widget/dist/widget.min.js');
}

buildWidget().catch(console.error);
