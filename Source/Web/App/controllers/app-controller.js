angular.module('app').controller('AppController', ['$scope', '$filter', '$timeout', 'defaultsService', 'rememberService', 'urlService', 'compilationService', 'branches', function ($scope, $filter, $timeout, defaultsService, rememberService, urlService, compilationService, branches) {
    'use strict';

    (function setupLanguages() {
        var csharp = { language: 'csharp', displayName: 'C#' };
        var vbnet  = { language: 'vbnet',  displayName: 'VB.NET' };
        var il     = { language: 'il',     displayName: 'IL' };

        $scope.languages = Object.freeze([csharp, vbnet]);
        $scope.targets = Object.freeze([csharp, vbnet, il]);

        $scope.codeMirrorModes = Object.freeze({
            csharp: 'text/x-csharp',
            vbnet:  'text/x-vb',
            il:     ''
        });
    })();

    (function setupBranches() {
        $scope.branch = null;
        $scope.branches = branches;
        $scope.branches.forEach(function (b) {
            b.id = b.name.replace('/', '-');
            b.commits.forEach(function (c) {
                c.date = new Date(c.date);
            });
        });
        $scope.displayBranch = function(branch) {
            return branch.name + ' (' + $filter('date')(branch.commits[0].date, 'd MMM') + ')';
        };
    })();

    (function loadOptions() {
        var urlData = urlService.loadFromUrl() || {};
        var options = urlData.options || rememberService.load();

        var defaults = defaultsService.getOptions();
        options = angular.extend({}, defaults, options);

        $scope.options = options;
        $scope.code = urlData.code || defaultsService.getCode(options.language);

        if (!options.branch)
            return;

        $scope.branch = $scope.branches.filter(function(b) {
            return b.id === options.branch;
        })[0] || null;
        if (!$scope.branch && options.branch) {
            options.branch = null;
            saveScopeToUrl();
        }
    })();

    (function watchOptions() {
        var updateImmediate = ifChanged(function() {
            saveScopeToUrl();
            rememberService.save($scope.options);
            processOnServer();
        });
        $scope.$watch('branch', ifChanged(function(branch) {
            $scope.options.branch = branch ? branch.id : null;
        }));
        for (var key in $scope.options) {
            if (key.indexOf('$') > -1)
                continue;

            $scope.$watch('options.' + key, updateImmediate);
        }
    })();
    
    $scope.process = function (cm, updateLinting) {
        $scope.code = cm.getValue();
        saveScopeToUrl();
        processOnServer(function (result) {
            updateLinting(cm, convertToAnnotations(result.errors, result.warnings));
        });
    };

    function convertToAnnotations(errors, warnings) {
        var annotations = [];
        var pushAnnotations = function (array) {
            if (!array)
                return;

            array.forEach(function(item) {
                annotations.push({
                    severity: item.severity.toLowerCase(),
                    message: item.message,
                    from: CodeMirror.Pos(item.start.line, item.start.column),
                    to: CodeMirror.Pos(item.end.line, item.end.column)
                });
            });
        }
        pushAnnotations(errors);
        pushAnnotations(warnings);
        return annotations;
    }

    function ifChanged(f) {
        return function(newValue, oldValue) {
            if (oldValue === newValue) // initial angular call?
                return;

            return f(newValue, oldValue);
        };
    }

    function saveScopeToUrl() {
        urlService.saveToUrl($scope.code, $scope.options);
    }

    function processOnServer(callback) {
        if ($scope.code === undefined || $scope.code === '')
            return;

        if ($scope.loading)
            return;

        callback = callback || function() {};

        $scope.loading = true;
        var branchUrl = $scope.branch ? $scope.branch.url : null;

        compilationService.process($scope.code, $scope.options, branchUrl).then(function (data) {
            $scope.loading = false;
            $scope.result = data;
            callback(data);
        }, function(response) {
            $scope.loading = false;
            var error = response.data;
            var report = error.exceptionMessage || error.message;
            if (error.stackTrace)
                report += '\r\n' + error.stackTrace;

            $scope.result = {
                success: false,
                errors: [ report ]
            };
            callback($scope.result);
        });
    }
}]);