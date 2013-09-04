/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/
 
/*global require console process*/

var bindings = require('./bindings'),
    astutil = require('./astutil'),
    pessimistic = require('./pessimistic'),
    semioptimistic = require('./semioptimistic'),
    diagnostics = require('./diagnostics'),
    fs = require('fs'),
    ArgumentParser = require('argparse').ArgumentParser;

var argParser = new ArgumentParser({
	addHelp: true,
	description: 'Call graph generator'
});

argParser.addArgument(['--fg'], {
	nargs: 0,
	help: 'print flow graph'
});

argParser.addArgument(['--cg'], {
	nargs: 0,
	help: 'print call graph'
});

argParser.addArgument(['--json'], {
	nargs: 0,
	help: 'output call graph as JSON object'
});

argParser.addArgument(['--time'], {
	nargs: 0,
	help: 'print timings'
});

argParser.addArgument(['--strategy'], {
	help: 'interprocedural propagation strategy; one of NONE, ONESHOT (default), DEMAND, and FULL (not yet implemented) '
});

var r = argParser.parseKnownArgs();
var args = r[0],
	files = r[1];

args.strategy = args.strategy || 'ONESHOT';
if (!args.strategy.match(/^(NONE|ONESHOT|DEMAND|FULL)$/)) {
	argParser.printHelp();
	process.exit(-1);
}
if (args.strategy === 'FULL') {
	console.warn('strategy FULL not implemented yet; using DEMAND instead');
	args.strategy = 'DEMAND';
}

if (args.json && !args.cg) {
	console.warn('ignoring --json, since --cg was not specified');
}

var sources = files.map(function(file) {
	return {
		filename: file,
		program: fs.readFileSync(file, 'utf-8')
	};
});
var times = [];

if (args.time) console.time("parsing  ");
var ast = astutil.buildAST(sources);
if (args.time) console.timeEnd("parsing  ");

if (args.time) console.time("bindings ");
bindings.addBindings(ast);
if (args.time) console.timeEnd("bindings ");

if (args.time) console.time("callgraph");
var cg;
if (args.strategy === 'NONE' || args.strategy === 'ONESHOT') {
	cg = pessimistic.buildCallGraph(ast, args.strategy === 'NONE');
} else if (args.strategy === 'DEMAND') {
	cg = semioptimistic.buildCallGraph(ast);
}
if (args.time) console.timeEnd("callgraph");

if (args.fg) console.log(cg.fg.dotify());
if (args.cg) {
	function pp(v) {
		if (v.type === 'CalleeVertex') return astutil.ppPos(v.call);
		if (v.type === 'FuncVertex') return astutil.ppPos(v.func);
		if (v.type === 'NativeVertex') return v.name;
		throw new Error("strange vertex: " + v);
	}

	var cg_edges = {};
	cg.edges.iter(function(call, fn) {
		var call_pp = pp(call),
			fn_pp = pp(fn);
		if (args.json) {
			var targets = cg_edges[call_pp] || (cg_edges[call_pp] = []);
			if (targets.indexOf(fn_pp) === -1) {
				targets.push(fn_pp);
			}
		} else {
			console.log(pp(call) + " -> " + pp(fn));
		}
	});
	if (args.json) {
		console.log(JSON.stringify(cg_edges, null, '  '));
	}
}