const fs = require('fs');
const path = require('path');
const { lstatSync, readdirSync, readFileSync, watchFile } = require('fs')
const { join } = require('path')
const cheerio = require('cheerio');
const appUncleFile = path.resolve('./app.uncle.xml');
const pretty = require('pretty');

function load() {
    require('dotenv').config();
}

function replaceEnv(content) {
    var context = {};
    context = {...context, ...process.env };
    var matches = content.match(/\{\{(.*?)\}\}/g);
    for (let match in matches) {
        let variable = matches[match].match(/\{\{(.*)\}\}/);
        if (process.env[variable[1]]) {
            content = content.replace(matches[match], process.env[variable[1]]);
        }
    }
    return content;
}

function parseDOM(content) {
    return cheerio.load(content,
        {
          xmlMode: true
        }
    );
}

function getContentMain(appUncleFile) {
    var contentMain = fs.readFileSync(appUncleFile, { encoding: 'utf-8' });
    return parseDOM(replaceEnv(contentMain));
}

function writeConfig(configUncleFile, contentMain) {
    fs.writeFileSync(configUncleFile, "module.exports = {xmlConfig: `"+contentMain+"`}", { encoding: 'utf-8' });
}

function parsePath(path) {
    let alias = {
        '~': 'node_modules',
        '@': 'src'
    }
    for (let a in alias) {
        path = path.replace(a, alias[a]);
    }
    return path;
}

function getModules(contentMain) {
    const modules = contentMain('module[path]');
    var modulesDict = {};
    modules.each(function() {
        const modulePath = parsePath(contentMain(this).attr('path'));
        const moduleXmlFile = path.resolve(modulePath+'/module.xml');
        watchFile(moduleXmlFile, (curr, prev) => {
            uncleLoop();
        })
        const moduleContent = replaceEnv(readFileSync(moduleXmlFile, { encoding: 'utf-8' }));
        try {
            const moduleTree = parseDOM(moduleContent);
            const moduleName = moduleTree('module').attr('name');
            modulesDict[moduleName] = moduleTree.root();
        } catch(e) {
            console.log(e);
            console.error('Module not loaded', folder);
        }
    })
    return modulesDict;
}

function iterateModules(contentMain) {
    const modulesContent = getModules(contentMain);
    const modulesMain = contentMain('modules > module, modules > include > module');
    modulesMain.each(function(index, element) {
        if (contentMain(this).html()) {
            modulesContent[contentMain(this).attr('name')] = contentMain(this);
        }
    }, modulesContent);
    return modulesContent;
}

function parseModules(contentMain) {
    const modules = iterateModules(contentMain);
    Object.keys(modules).forEach(mod => {
        const moduleNode = contentMain(`module[name="${mod}"]`);
        let moduleAppName = moduleNode.attr('app');
        let moduleApiName = moduleNode.attr('api');
        const moduleInclude = moduleNode.parent('include');
        if (moduleInclude) {
            moduleAppName = moduleInclude.attr('app');
            moduleApiName = moduleInclude.attr('api');
        }
        if (moduleAppName) {
            const app = contentMain(`app[name="${moduleAppName}"]`);
            const moduleApp = modules[mod].find('app');
            if (moduleApp.html()) {
                app.append(moduleApp.html());
            }
        }
        if (moduleApiName) {
            const api = contentMain(`api[name="${moduleApiName}"]`);
            const moduleApi = modules[mod].find('api');
            if (moduleApi.html()) {
                api.append(moduleApi.html());
            }
        }
        if (!moduleAppName && !moduleApiName) {
            moduleNode.replaceWith(modules[mod].html());
        }
        moduleNode.remove();
    });
}

function parseAppend(tree) {
    const appendElements = tree('append:not([position])');
    appendElements.each(function() {
        let appendTag = tree(this).attr('tag');
        let appendName = tree(this).attr('name');
        let toAdd = tree(`${appendTag}[name="${appendName}"]`);
        toAdd.append(tree(this).html());
        tree(this).remove();
    });
    const endElements = tree('append[position="end"]');
    endElements.each(function() {
        let appendTag = tree(this).attr('tag');
        let appendName = tree(this).attr('name');
        let toAdd = tree(`${appendTag}[name="${appendName}"]`);
        toAdd.append(tree(this).html());
        tree(this).remove();
    });
}

function parsePrepend(tree) {
    const prependElements = tree('prepend');
    prependElements.each(function() {
        let prependTag = tree(this).attr('tag');
        let prependName = tree(this).attr('name');
        let toPrepend = tree(`${prependTag}[name="${prependName}"]`);
        toPrepend.prepend(tree(this).html());
        tree(this).remove();
    });
}

function parseReplace(tree) {
    const replaceElements = tree('replace');
    replaceElements.each(function() {
        let replaceTag = tree(this).attr('tag');
        let replaceName = tree(this).attr('name');
        let toReplace = tree(`${replaceTag}[name="${replaceName}"]`);
        toReplace.replaceWith(tree(this).html());
        tree(this).remove();
    });
}

function prettifyXML(xmlText) {
    return pretty(xmlText);
}

function uncleLoop() {
    const configUncleFile = path.resolve('./uncle.config.js');
    load();
    const contentMain = getContentMain(appUncleFile);
    parseModules(contentMain);
    parseReplace(contentMain);
    parseAppend(contentMain);
    parsePrepend(contentMain);
    writeConfig(configUncleFile, prettifyXML(contentMain.html()));
}

module.exports = (api, opts) => {
    watchFile(appUncleFile, (curr, prev) => {
        uncleLoop();
    });
    uncleLoop();
};