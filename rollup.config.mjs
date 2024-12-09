import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { header } from 'rollup-plugin-header'

export default [
	{
		plugins: [
			resolve(),
			commonjs(),
		],
		input: 'src/index.js',
		// https://github.com/rollup/rollup/wiki/Troubleshooting#this-is-undefined
		context: 'this',
		watch: { clearScreen: false },
		output: [
			{
				file: 'dist/index.js',
				format: 'cjs',
				exports: 'named',
			},
			// {
			// 	file: 'dist/index.esm.js',
			// 	format: 'es',
			// 	exports: 'named',
			// },
			// {
			// 	file: 'dist/index.amd.js',
			// 	format: 'amd',
			// 	exports: 'named',
			// },
			// {
			// 	file: 'dist/index.umd.js',
			// 	name: 'tunjs',
			// 	format: 'umd',
			// 	exports: 'named',
			// },
		],
	},
	{
		plugins: [
			resolve(),
			commonjs(),
			header({ 'header': '#!/usr/bin/env node\n' })
		],
		input: 'src/cli.js',
		context: 'this',
		watch: { clearScreen: false },
		output: [
			{
				file: 'bin/cli.js',
				format: 'cjs',
				exports: 'named',
			},
		],
	},
]
