App.controller('SearchController', ['$scope', '$routeParams', '$location', '$log', 'config', 'RedisService',
    function ($scope, $routeParams, $location, $log, config, RedisService) {
        "use strict";

        $log.debug('SearchController', $routeParams);

        $scope.search = {
            completed: false,
            pattern: '',
            page: 1,
            pageCount: 0,
            sort: {
                field: 'name',
                reverse: false
            },
            result: {
                pattern: '',
                selected: [],
                keys: [],
                total: 0,
                pageSize: 1
            }
        };

        $scope.submitSearch = function () {
            if ($scope.searchForm.$valid) {
                $location.path('server/' + $scope.server().id + '/db/' + $scope.db().id + '/search/' + $scope.search.pattern, false);
                $scope.searchKey($scope.search.pattern, 1);
            }
        };

        $scope.searchKey = function (pattern, page) {
            $log.debug('searchKey', arguments);

            $scope.search.pattern = pattern;
            $scope.search.completed = false;

            return RedisService.searchKeys($scope.server().id, $scope.db().id, pattern, page).then(
                function (response) {
                    $log.debug('searchKey / done');

                    /*
                     * because pagination plugin watches total count and page,
                     * these variables should be changed in one scope
                     */
                    $scope.search.page = page;
                    $scope.search.result.pattern = pattern;
                    $scope.search.result.total = response.data.metadata.total;
                    $scope.search.result.pageSize = response.data.metadata.page_size;

                    $scope.search.result.keys = [];
                    angular.forEach(response.data.items, function (value) {
                        $scope.search.result.keys.push(value);
                    });

                    $scope.search.completed = true;
                }
            );
        };

        $scope.selectKeyExclusive = function (key) {
            $log.debug('selectKeyExclusive', arguments);

            for (var i = 0; i < $scope.search.result.keys.length; i++) {
                if ($scope.search.result.keys[i].name == key) {
                    // if multiple keys are selected - then select current key
                    // if only one key was selected - then inverse current state
                    // (i.e. allow to unselect current key) 
                    $scope.search.result.keys[i].selected = $scope.search.result.selected.length == 1 ? !$scope.search.result.keys[i].selected : true;
                }
                else {
                    $scope.search.result.keys[i].selected = false;
                }
            }
        };

        $scope.deleteKeys = function () {
            $log.debug('deleteKeys');

            var deleteKeys = $scope.search.result.selected;
            if (deleteKeys) {
                $scope.showModalConfirm({
                    title: 'Delete key(s) forever?',
                    message: (deleteKeys.length == 1 ? '1 key is' : deleteKeys.length + ' keys are') + ' about to be permanently deleted:',
                    items: deleteKeys,
                    warning: 'You can\'t undo this action!',
                    action: 'Delete'
                }).result.then(
                    function () {
                        RedisService.deleteKeys($scope.server().id, $scope.db().id, deleteKeys).then(
                            function (response) {
                                $log.debug('deleteKeys / done', response.data);

                                // remove deleted keys from scope
                                for (var i = $scope.search.result.keys.length - 1; i >= 0; i--) {
                                    if (deleteKeys.indexOf($scope.search.result.keys[i].name) >= 0) {
                                        $scope.search.result.keys.splice(i, 1);
                                    }
                                }
                                // reduce amount of keys in search result and whole db
                                $scope.search.result.total -= response.data.result;
                                $scope.db().keys -= response.data.result;
                            }
                        );
                    }
                );
            }
        };

        $scope.editKeyTtl = function () {
            $log.debug('editKeyTtl');

            var key = $scope.search.result.selected[0];
            var ttl = 0;

            if (key) {
                for (var i = 0; i < $scope.search.result.keys.length; i++) {
                    if ($scope.search.result.keys[i].name == key) {
                        ttl = $scope.search.result.keys[i].ttl;
                        break;
                    }
                }

                $scope.showModal('ModalEditKeyAttributeController', 'editkeyattribute.ttl',
                    {
                        value: ttl < 0 ? 0 : ttl,
                        key: key
                    }
                ).result.then(
                    function (newTtl) {
                        RedisService.expireKey($scope.server().id, $scope.db().id, key, newTtl).then(
                            function (response) {
                                $log.debug('editKeyTtl / done', response.data);

                                // update key ttl in scope
                                for (var i = $scope.search.result.keys.length - 1; i >= 0; i--) {
                                    if ($scope.search.result.keys[i].name == key) {
                                        $scope.search.result.keys[i].ttl = newTtl;
                                        break;
                                    }
                                }
                            }
                        );
                    }
                );
            }
        };

        $scope.editKeyName = function () {
            $log.debug('editKeyName');

            var key = $scope.search.result.selected[0];

            if (key) {
                $scope.showModal('ModalEditKeyAttributeController', 'editkeyattribute.name',
                    {
                        value: key,
                        key: key
                    }
                ).result.then(
                    function (newName) {
                        if (newName != key) {
                            RedisService.renameKey($scope.server().id, $scope.db().id, key, newName).then(
                                function (response) {
                                    $log.debug('editKeyName / done', response.data);

                                    if (response.data.result) {
                                        // update key name in scope
                                        for (var i = $scope.search.result.keys.length - 1; i >= 0; i--) {
                                            if ($scope.search.result.keys[i].name == key) {
                                                $scope.search.result.keys[i].name = newName;
                                                break;
                                            }
                                        }
                                    }
                                    else {
                                        $scope.showModalAlert({
                                            title: 'Rename error!',
                                            message: 'Could not rename key "' + key + '" to "' + newName + '"'
                                        });
                                    }
                                }
                            );
                        }
                    }
                );
            }
        };

        $scope.moveKeys = function () {
            $log.debug('moveKeys');

            var moveKeys = $scope.search.result.selected;

            if (moveKeys) {
                $scope.showModal('ModalEditKeyAttributeController', 'confirm.movekeys',
                    {
                        title: 'Move the key(s)?',
                        message: (moveKeys.length == 1 ? '1 key is' : moveKeys.length + ' keys are') + ' about to be moved:',
                        items: moveKeys,
                        databases: $scope.server().databases
                    }
                ).result.then(
                    function (newDB) {
                        RedisService.moveKeys($scope.server().id, $scope.db().id, moveKeys, newDB).then(
                            function (response) {
                                $log.debug('moveKeys / done', response.data);

                                // remove moved keys from scope
                                for (var i = $scope.search.result.keys.length - 1; i >= 0; i--) {
                                    if (moveKeys.indexOf($scope.search.result.keys[i].name) >= 0) {
                                        $scope.search.result.keys.splice(i, 1);
                                    }
                                }
                                // reduce amount of keys in search result and current db
                                $scope.search.result.total -= response.data.result;
                                $scope.db().keys -= response.data.result;

                                // increase amount of keys in a new db
                                $scope.server().databaseById(newDB).keys += response.data.result;
                            }
                        );
                    }
                );
            }
        };

        $scope.getKeyUri = function (key, encode) {
            encode = angular.isDefined(encode) ? encode : false;
            return 'server/' + $scope.server().id + '/db/' + $scope.db().id + '/key/view/' + (encode ? encodeURIComponent(key) : key);
        };

        $scope.openKey = function () {
            var key = $scope.search.result.selected[0];
            if (key) {
                $location.path($scope.getKeyUri(key));
            }
        };

        $scope.setPage = function () {
            $log.debug('setPage', $scope.search.page);

            $location.path('server/' + $scope.server().id + '/db/' + $scope.db().id + '/search/' + $scope.search.pattern + '/' + $scope.search.page, false);
            $scope.searchKey($scope.search.pattern, $scope.search.page);
        };

        $scope.$watch('search.result.keys', function () {
            $scope.search.result.selected = [];
            for (var i = 0; i < $scope.search.result.keys.length; i++) {
                if ($scope.search.result.keys[i].selected) {
                    $scope.search.result.selected.push($scope.search.result.keys[i].name);
                }
            }
        }, true);

        $scope.init($routeParams.serverId, $routeParams.dbId).then(function () {
            $log.debug('SearchController.init');

            $scope.$parent.view = {
                title: $scope.db().name,
                subtitle: 'Browse'
            };

            if ($routeParams.pattern) {
                var page = parseInt($routeParams.page, 10) | 1;
                $scope.searchKey($routeParams.pattern, page);
            } else if (!$scope.db().isEmpty && $scope.db().keys <= config.search.auto_max_keys) {
                $scope.searchKey('*', 1);
            } else {
                $scope.search.completed = true;
            }
        });
    }
]);
