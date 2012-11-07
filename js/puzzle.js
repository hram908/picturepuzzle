PuzzleApplication = (function ($) {
    var Puzzle = null;
    var EventDispatcher = null;

    var canvas = null,
        puzzle = null,
        puzzleStatus = null,
        initScreen = null,
        puzzleCanvas = null,
        messageBox = null;

    var PUZZLE_STATUS = {
        WON: 1,
        LOST: -1,
        NO_RESULT: 0
    };

    EventDispatcher = $.inherit(
    {
        _listeners: {},

        __constructor: function () { },

        addListener: function (type, listener) {
            if (typeof this._listeners[type] == "undefined") {
                this._listeners[type] = [];
            }

            this._listeners[type].push(listener);
        },

        fire: function (event) {
            if (typeof event == "string") {
                event = { type: event };
            }
            if (!event.target) {
                event.target = this;
            }

            if (!event.type) {  //falsy
                throw new Error("Event object missing 'type' property.");
            }

            if (this._listeners[event.type] instanceof Array) {
                var listeners = this._listeners[event.type];
                for (var i = 0, len = listeners.length; i < len; i++) {
                    listeners[i].call(this, event);
                }
            }
        },

        removeListener: function (type, listener) {
            if (this._listeners[type] instanceof Array) {
                var listeners = this._listeners[type];
                for (var i = 0, len = listeners.length; i < len; i++) {
                    if (listeners[i] === listener) {
                        listeners.splice(i, 1);
                        break;
                    }
                }
            }
        }
    },
    {}
    );

    PuzzleControls = $.inherit(EventDispatcher,
    {
        controlCanvas: null,
        __constructor: function () {
            var argumentArray = Array.prototype.slice.call(arguments);
            this.controlCanvas = argumentArray[0];
            this.init();
        }

    },
    {}
    );

    Puzzle = $.inherit(EventDispatcher,
    {
        puzzleCanvas: null,
        imageURL: "",
        scrambleSize: 4,
        tileSizeXY: null,
        imageSizeXY: null,
        tiles: null,
        freeGroupID: 0,
        mousePreviousPosition: new Position(0, 0),
        selectedTile: null,
        minImageSize: 40,
        imageAspectRatio: null,
        affineSpace: 10,
        marginSpace: 100,
        puzzleStatus: null,

        __constructor: function () {
            var argumentArray = Array.prototype.slice.call(arguments);
            this.puzzleCanvas = argumentArray[0];
            this.init();
        },

        launchPuzzle: function () {
        },

        useImage: function (image) {
            if (this.tiles) this.destroyOldTiles();
            this.imageURL = image;
            this.loadImage();
        },

        init: function () {
            this.mousePreviousPosition = new Position(0, 0);

            var context = this;
            $(this.puzzleCanvas).mousedown(function (evt) {
                Puzzle.prototype.onMouseDownOnScene.call(context, evt);
                return false;
            });
            if (document.body.addEventListener)
                document.body.addEventListener('DOMMouseScroll', function (event) {
                    Puzzle.prototype.onZoom.call(context, event);
                    return false;
                }, false);
            $(this.puzzleCanvas).bind('mousewheel', function (event) {
                Puzzle.prototype.onZoom.call(context, event);
                return false;
            });
        },

        destroyOldTiles: function () {
            if (!this.tiles) return;
            for (var i = 0; i < this.tiles.length; i++) {
                $(this.tiles[i].UI).remove();
            }
            this.tiles = null;
        },

        determineTileSize: function () {
            var canvasDimRatio = $(this.puzzleCanvas).height() / $(this.puzzleCanvas).width();
            var imageDimRatio = this.image.height / this.image.width;
            this.imageAspectRatio = imageDimRatio;
            var imageHeight = this.image.height;
            var imageWidth = this.image.width;
            if (canvasDimRatio <= imageDimRatio) {
                imageHeight = $(this.puzzleCanvas).height() - this.marginSpace;
                imageWidth = imageHeight / this.image.height * this.image.width;
            }
            else {
                imageWidth = $(this.puzzleCanvas).width() - this.marginSpace;
                imageHeight = imageWidth / this.image.width * this.image.height;
            }
            this.tileSizeXY = new Position(Math.round(imageWidth / this.scrambleSize), Math.round(imageHeight / this.scrambleSize));
            this.imageSizeXY = new Position(this.tileSizeXY.x * this.scrambleSize, this.tileSizeXY.y * this.scrambleSize);
        },

        loadImage: function () {
            this.image = $("<img></img>")[0];
            $(this.puzzleCanvas).css("cursor", "wait");
            var context = this;
            this.image.onload = function (evt) {
                Puzzle.prototype.onImageLoaded.call(context, evt);
                return false;
            };
            this.image.src = this.imageURL;
        },

        onImageLoaded: function () {
            $(this.puzzleCanvas).css("cursor", "auto");
            this.determineTileSize();
            this.scrambleImage();
        },

        onZoom: function (event) {
            delta = (event.wheelDelta) ? event.wheelDelta : -event.detail;
            if (delta == 0) return;
            scaleFactor = (delta > 0) ? 1.1 : 1 / 1.1; 
            tileSizeX = Math.round(parseFloat(this.tiles[0].UI.style.width) * scaleFactor);
            tileSizeY = Math.round(parseFloat(this.tiles[0].UI.style.height) * scaleFactor);
            if ((delta < 0 && (tileSizeX <= this.minImageSize || tileSizeY <= this.minImageSize)) || (delta > 0 && (tileSizeX >= $(this.puzzleCanvas).width() || tileSizeY >= $(this.puzzleCanvas).height()))) return;
            this.tileSizeXY.x = tileSizeX;
            this.tileSizeXY.y = tileSizeY;
            this.imageSizeXY.x = this.tileSizeXY.x * this.scrambleSize;
            this.imageSizeXY.y = this.tileSizeXY.y * this.scrambleSize;

            var arrangedGroups = new Array();
            for (var i = 0; i < this.tiles.length; i++) {
                if (arrangedGroups.indexOf(this.tiles[i].Group) == -1) {
                    if (this.tiles[i].Group != -1) {
                        this.arrangeGroup(this.tiles[i], new Position(
                                            Math.round(parseFloat(this.tiles[i].UI.style.left) * scaleFactor - $(this.puzzleCanvas).width() / 2 * (scaleFactor - 1)),
                                            Math.round(parseFloat(this.tiles[i].UI.style.top) * scaleFactor - $(this.puzzleCanvas).height() / 2 * (scaleFactor - 1))
                                            ),
                                            this.tileSizeXY, this.imageSizeXY);
                        arrangedGroups.push(this.tiles[i].Group);
                    }
                    else {
                        this.tiles[i].Move(
                                new Position(
                                            Math.round(parseFloat(this.tiles[i].UI.style.left) * scaleFactor - $(this.puzzleCanvas).width() / 2 * (scaleFactor - 1)),
                                            Math.round(parseFloat(this.tiles[i].UI.style.top) * scaleFactor - $(this.puzzleCanvas).height() / 2 * (scaleFactor - 1))
                                            )
                            );
                        this.tiles[i].Scale(this.tileSizeXY, this.imageSizeXY);
                    }
                }
            }
            this.preventDefaultAndCancelBubble(event);
        },

        arrangeGroup: function (refTile, position, tileSize, imageSize, arrangedTiles) {
            arrangedTiles = arrangedTiles || new Array();
            refTile.Move(position);
            refTile.Scale(tileSize, imageSize);
            arrangedTiles.push(refTile.Row * this.scrambleSize + refTile.Column);

            var tileOnLeft = this.tileOn("left", refTile);
            var tileOnRight = this.tileOn("right", refTile);
            var tileOnTop = this.tileOn("top", refTile);
            var tileOnBottom = this.tileOn("bottom", refTile);

            if (refTile.GroupedWithNeighbour.left && tileOnLeft != null && arrangedTiles.indexOf(tileOnLeft.Row * this.scrambleSize + tileOnLeft.Column) == -1) {
                this.arrangeGroup(tileOnLeft, new Position(parseInt(refTile.UI.style.left) - tileSize.x, parseInt(refTile.UI.style.top)), tileSize, imageSize, arrangedTiles);
            }
            if (refTile.GroupedWithNeighbour.right && tileOnRight != null && arrangedTiles.indexOf(tileOnRight.Row * this.scrambleSize + tileOnRight.Column) == -1) {
                this.arrangeGroup(tileOnRight, new Position(parseInt(refTile.UI.style.left) + tileSize.x, parseInt(refTile.UI.style.top)), tileSize, imageSize, arrangedTiles);
            }
            if (refTile.GroupedWithNeighbour.top && tileOnTop != null && arrangedTiles.indexOf(tileOnTop.Row * this.scrambleSize + tileOnTop.Column) == -1) {
                this.arrangeGroup(tileOnTop, new Position(parseInt(refTile.UI.style.left), parseInt(refTile.UI.style.top) - tileSize.y), tileSize, imageSize, arrangedTiles);
            }
            if (refTile.GroupedWithNeighbour.bottom && tileOnBottom != null && arrangedTiles.indexOf(tileOnBottom.Row * this.scrambleSize + tileOnBottom.Column) == -1) {
                this.arrangeGroup(tileOnBottom, new Position(parseInt(refTile.UI.style.left), parseInt(refTile.UI.style.top) + tileSize.y), tileSize, imageSize, arrangedTiles);
            }
        },

        tileOn: function (side, tile) {
            switch (side) {
                case "left":
                    return (tile.Column != 0) ? this.tiles[tile.Row * this.scrambleSize + tile.Column - 1] : null;
                case "right":
                    return (tile.Column != this.scrambleSize - 1) ? this.tiles[tile.Row * this.scrambleSize + tile.Column + 1] : null;
                case "top":
                    return (tile.Row != 0) ? this.tiles[(tile.Row - 1) * this.scrambleSize + tile.Column] : null;
                case "bottom":
                    return (tile.Row != this.scrambleSize - 1) ? this.tiles[(tile.Row + 1) * this.scrambleSize + tile.Column] : null;
                default:
                    return null;
            }
        },

        scrambleImage: function () {
            var context = this;
            this.tiles = new Array();
            for (var row = 0; row < this.scrambleSize; row++) {
                for (var column = 0; column < this.scrambleSize; column++) {
                    var zIndex = row * this.scrambleSize + column;
                    var tile = new Tile(
                                    this.imageURL,
                                    row,
                                    column,
                                    new Position(
                                                Math.round(Math.random() * ($(this.puzzleCanvas).width() - this.tileSizeXY.x)),
                                                Math.round(Math.random() * ($(this.puzzleCanvas).height() - this.tileSizeXY.y))
                                                ),
                                    this.tileSizeXY,
                                    this.imageSizeXY,
                                    zIndex
                                    );

                    this.tiles[row * this.scrambleSize + column] = tile;
                    $(this.puzzleCanvas).append(tile.UI);
                    $(tile.UI).mousedown(function (evt) { Puzzle.prototype.onMouseDownOnTile.call(context, evt); return false; });
                }
            }
        },

        onMouseDownOnTile: function (event) {
            var context = this;
            this.selectedTile = event.currentTarget;

            $(this.selectedTile).unbind("mousedown");
            $(document).mousemove(function (evt) {
                Puzzle.prototype.onTileDrag.call(context, evt);
                return false;
            });
            $(document).mouseup(function (evt) {
                Puzzle.prototype.onMouseUpFromTile.call(context, evt);
                return false;
            });
            this.mousePreviousPosition.x = event.clientX;
            this.mousePreviousPosition.y = event.clientY;

            this.selectTileGroup(this.selectedTile.__tile__);

            this.preventDefaultAndCancelBubble(event);
        },

        count: 0,

        onTileDrag: function (event) {
            //            if (console) console.log(this.count++ + " : on Tile Drag -- (" + (event.clientX - this.mousePreviousPosition.x) + "," + (event.clientY - this.mousePreviousPosition.y) + ")");
            if (event.clientX - this.mousePreviousPosition.x == 0 && event.clientY - this.mousePreviousPosition.y == 0) return;
            this.updateTileGroupPosition(this.selectedTile.__tile__, new Position(event.clientX - this.mousePreviousPosition.x, event.clientY - this.mousePreviousPosition.y));

            this.mousePreviousPosition.x = event.clientX;
            this.mousePreviousPosition.y = event.clientY;

            this.preventDefaultAndCancelBubble(event);
        },

        onMouseUpFromTile: function (event) {
            var context = this;
            $(document).unbind("mousemove");
            $(document).unbind("mouseup");
            $(this.selectedTile).mousedown(function (evt) {
                Puzzle.prototype.onMouseDownOnTile.call(context, evt);
                return false;
            });

            this.deselectTileGroup(this.selectedTile.__tile__);

            if (this.puzzleStatus != PUZZLE_STATUS.WON) {
                this.checkAndGroupTiles();

                this.bringTileGroupToTop(this.selectedTile);

                if (this.isPuzzleSolved()) {
                    this.puzzleStatus = PUZZLE_STATUS.WON;
                    this.showSuccess();
                }
            }

            this.preventDefaultAndCancelBubble(event);
        },

        onMouseDownOnScene: function (event) {
            var context = this;
            $(this.puzzleCanvas).unbind("mousedown");
            $(document).mousemove(function (evt) {
                Puzzle.prototype.onSceneMove.call(context, evt);
                return false;
            });
            $(document).mouseup(function (evt) {
                Puzzle.prototype.onMouseUpFromScene.call(context, evt);
                return false;
            });

            this.mousePreviousPosition.x = event.clientX;
            this.mousePreviousPosition.y = event.clientY;

            this.preventDefaultAndCancelBubble(event);
        },

        onSceneMove: function (event) {
            if (event.clientX - this.mousePreviousPosition.x == 0 && event.clientY - this.mousePreviousPosition.y == 0) return;
            this.updateAllTilePosition(new Position(event.clientX - this.mousePreviousPosition.x, event.clientY - this.mousePreviousPosition.y));

            this.mousePreviousPosition.x = event.clientX;
            this.mousePreviousPosition.y = event.clientY;

            this.preventDefaultAndCancelBubble(event);
        },

        onMouseUpFromScene: function (event) {
            var context = this;
            $(document).unbind("mousemove");
            $(document).unbind("mouseup");
            $(this.puzzleCanvas).mousedown(function (evt) {
                Puzzle.prototype.onMouseDownOnScene.call(context, evt);
                return false;
            });

            this.preventDefaultAndCancelBubble(event);
        },

        eachMemberOfGroup: function (tileGroup, fn) {
            if (tileGroup != -1) {
                for (var i = 0; i < this.tiles.length; i++) {
                    if (tileGroup == this.tiles[i].Group)
                        fn.call(this, this.tiles[i]);
                }
            }
            else {
                fn.call(this, null);
            }
        },

        selectTileGroup: function (tile) {
            tile.__z_index__ = tile.UI.style.zIndex;
            this.eachMemberOfGroup(tile.Group, function (tileToBeModified) {
                tileToBeModified = tileToBeModified || tile;
                tileToBeModified.UI.style.zIndex = 500;
            });
        },

        deselectTileGroup: function (tile) {
            this.eachMemberOfGroup(tile.Group, function (tileToBeModified) {
                tileToBeModified = tileToBeModified || tile;
                tileToBeModified.UI.style.zIndex = tile.__z_index__;
            });
        },

        showSuccess: function () {
            this.fire(Puzzle.onSuccess);
        },

        bringTileGroupToTop: function (selectedTile) {
            var selectedTileZ_Index = parseInt(selectedTile.style.zIndex)
            var maxZ_Index = selectedTileZ_Index;
            for (var i = 0; i < this.tiles.length; i++) {
                var tilezIndex = parseInt(this.tiles[i].UI.style.zIndex);
                if (tilezIndex > selectedTileZ_Index) {
                    if (tilezIndex > maxZ_Index) maxZ_Index = tilezIndex;
                    this.tiles[i].UI.style.zIndex = tilezIndex - 1;
                }
            }
            this.eachMemberOfGroup(selectedTile.__tile__.Group, function (tileToBeModified) {
                tileToBeModified = tileToBeModified || selectedTile.__tile__;
                tileToBeModified.UI.style.zIndex = maxZ_Index;
            });
        },

        preventDefaultAndCancelBubble: function (event) {
            event.stopPropagation();
            event.preventDefault();
        },

        checkAndGroupTiles: function () {
            if (this.selectedTile.__tile__.Group != -1) {
                for (var i = 0; i < this.tiles.length; i++) {
                    if (this.selectedTile.__tile__.Group == this.tiles[i].Group) {
                        //WARNING!! checkAndGroupTile method updates the selectedTiles group.. 
                        //so here every loop iteration need to check the new Group of selected tile
                        this.checkAndGroupTile(this.tiles[i]);
                    }
                }
            }
            else {
                this.checkAndGroupTile(this.selectedTile.__tile__);
            }
            this.updateGroupedWithNeighbourProperty();
        },

        checkAndGroupTile: function (tile) {
            if (tile.GroupedWithNeighbour.all == true) return;

            var selectedTileRow = tile.Row;
            var selectedTileColumn = tile.Column;
            var selectedTileGroup = tile.Group;
            var tileToBeOnLeft = (selectedTileColumn != 0) ? this.tiles[selectedTileRow * this.scrambleSize + selectedTileColumn - 1] : null;
            var tileToBeOnRight = (selectedTileColumn != this.scrambleSize - 1) ? this.tiles[selectedTileRow * this.scrambleSize + selectedTileColumn + 1] : null;
            var tileToBeOnTop = (selectedTileRow != 0) ? this.tiles[(selectedTileRow - 1) * this.scrambleSize + selectedTileColumn] : null;
            var tileToBeOnBottom = (selectedTileRow != this.scrambleSize - 1) ? this.tiles[(selectedTileRow + 1) * this.scrambleSize + selectedTileColumn] : null;

            if (tileToBeOnLeft != null && tile.GroupedWithNeighbour.left != true && Math.abs((parseInt(tileToBeOnLeft.UI.style.left) + parseInt(tile.UI.style.width)) - parseInt(tile.UI.style.left)) < this.affineSpace && Math.abs(parseInt(tileToBeOnLeft.UI.style.top) - parseInt(tile.UI.style.top)) < this.affineSpace) {
                this.updateTileGroupPosition(tile, new Position((parseInt(tileToBeOnLeft.UI.style.left) + parseInt(tile.UI.style.width)) - parseInt(tile.UI.style.left), parseInt(tileToBeOnLeft.UI.style.top) - parseInt(tile.UI.style.top)));
                this.updateGroup(tile, tileToBeOnLeft);
            }
            if (tileToBeOnTop != null && tile.GroupedWithNeighbour.top != true && Math.abs(parseInt(tileToBeOnTop.UI.style.left) - parseInt(tile.UI.style.left)) < this.affineSpace && Math.abs(parseInt(tileToBeOnTop.UI.style.top) + parseInt(tile.UI.style.height) - parseInt(tile.UI.style.top)) < this.affineSpace) {
                this.updateTileGroupPosition(tile, new Position(parseInt(tileToBeOnTop.UI.style.left) - parseInt(tile.UI.style.left), parseInt(tileToBeOnTop.UI.style.top) + parseInt(tile.UI.style.height) - parseInt(tile.UI.style.top)));
                this.updateGroup(tile, tileToBeOnTop);
            }
            if (tileToBeOnRight != null && tile.GroupedWithNeighbour.right != true && Math.abs(parseInt(tileToBeOnRight.UI.style.left) - (parseInt(tile.UI.style.left) + parseInt(tile.UI.style.width))) < this.affineSpace && Math.abs(parseInt(tileToBeOnRight.UI.style.top) - parseInt(tile.UI.style.top)) < this.affineSpace) {
                this.updateTileGroupPosition(tile, new Position(parseInt(tileToBeOnRight.UI.style.left) - (parseInt(tile.UI.style.left) + parseInt(tile.UI.style.width)), parseInt(tileToBeOnRight.UI.style.top) - parseInt(tile.UI.style.top)));
                this.updateGroup(tile, tileToBeOnRight);
            }
            if (tileToBeOnBottom != null && tile.GroupedWithNeighbour.bottom != true && Math.abs(parseInt(tileToBeOnBottom.UI.style.left) - parseInt(tile.UI.style.left)) < this.affineSpace && Math.abs(parseInt(tileToBeOnBottom.UI.style.top) - (parseInt(tile.UI.style.top) + parseInt(tile.UI.style.height))) < this.affineSpace) {
                this.updateTileGroupPosition(tile, new Position(parseInt(tileToBeOnBottom.UI.style.left) - parseInt(tile.UI.style.left), parseInt(tileToBeOnBottom.UI.style.top) - (parseInt(tile.UI.style.top) + parseInt(tile.UI.style.height))));
                this.updateGroup(tile, tileToBeOnBottom);
            }
        },

        updateGroupedWithNeighbourProperty: function () {
            for (var i = 0; i < this.tiles.length; i++) {
                //it would have been so much simpler if it was 2d array.. but lets continue..
                this.tiles[i].GroupedWithNeighbour.left = (this.tiles[i].GroupedWithNeighbour.left == true || i % this.scrambleSize == 0 || (this.tiles[i].Group != -1 && this.tiles[i].Group == this.tiles[i - 1].Group)) ? true : false;
                this.tiles[i].GroupedWithNeighbour.right = (this.tiles[i].GroupedWithNeighbour.right == true || i % this.scrambleSize == this.scrambleSize - 1 || (this.tiles[i].Group != -1 && this.tiles[i].Group == this.tiles[i + 1].Group)) ? true : false;
                this.tiles[i].GroupedWithNeighbour.top = (this.tiles[i].GroupedWithNeighbour.top == true || i < this.scrambleSize || (this.tiles[i].Group != -1 && this.tiles[i].Group == this.tiles[i - this.scrambleSize].Group)) ? true : false;
                this.tiles[i].GroupedWithNeighbour.bottom = (this.tiles[i].GroupedWithNeighbour.bottom == true || i >= this.scrambleSize * (this.scrambleSize - 1) || (this.tiles[i].Group != -1 && this.tiles[i].Group == this.tiles[i + this.scrambleSize].Group)) ? true : false;
                if (this.tiles[i].GroupedWithNeighbour.left == true &&
                    this.tiles[i].GroupedWithNeighbour.right == true &&
                    this.tiles[i].GroupedWithNeighbour.top == true &&
                    this.tiles[i].GroupedWithNeighbour.bottom == true)
                    this.tiles[i].GroupedWithNeighbour.all = true;
            }
        },

        updateTileGroupPosition: function (tileInConcern, offset) {
            this.eachMemberOfGroup(tileInConcern.Group, function (tileToBeModified) {
                tileToBeModified = tileToBeModified || tileInConcern;
                $(tileToBeModified.UI).css({ "left": parseInt(tileToBeModified.UI.style.left) + offset.x, "top": parseInt(tileToBeModified.UI.style.top) + offset.y });
            });
        },

        updateAllTilePosition: function (offset) {
            for (var i = 0; i < this.tiles.length; i++) {
                $(this.tiles[i].UI).css({ "left": parseInt(this.tiles[i].UI.style.left) + offset.x, "top": parseInt(this.tiles[i].UI.style.top) + offset.y });
            }
        },

        updateAllTilePositionDirectly: function (position) {
            for (var i = 0; i < this.tiles.length; i++) {
                $(this.tiles[i].UI).css({ "left": position.x, "top": position.y });
            }
        },

        updateGroup: function (tileInConcern, tileInVicinity) {
            if (tileInVicinity.Group != -1) {
                if (tileInConcern.Group != -1) {
                    var tileInConcernGroup = tileInConcern.Group;
                    for (var i = 0; i < this.tiles.length; i++) {
                        if (this.tiles[i].Group == tileInConcernGroup)
                            this.tiles[i].Group = tileInVicinity.Group;
                    }
                }
                else
                    tileInConcern.Group = tileInVicinity.Group;
            }
            else if (tileInConcern.Group != -1) {
                tileInVicinity.Group = tileInConcern.Group;
            }
            else {
                tileInVicinity.Group = tileInConcern.Group = this.freeGroupID++;
            }
        },

        isPuzzleSolved: function () {
            for (var i = 0; i < this.tiles.length; i++) {
                if (this.tiles[i].GroupedWithNeighbour.all == false)
                    return false;
            }
            return true;
        }
    },
    {
        onSuccess: "success",
        image: null
    }
    );

    function Tile(imageURL, row, column, position, tileSize, imageSize, zIndex) {
        var tileContainer = $("<div class=\"tileContainer\"></div>")[0];
        $(tileContainer).css({ left: position.x, top: position.y, height: tileSize.y, width: tileSize.x, zIndex: zIndex }); // "background-image": "url(" + imageURL + ")", overflow: "hidden", "background-repeat": "no-repeat", "background-attachment": "scroll", "background-position": column * (-tileSize.x) + "px " + row * (-tileSize.y) + "px", "background-size": imageSize.x + "px " + imageSize.y + "px" });
        var tileImage = $("<img src=\"" + imageURL + "\" alt=\"\" class=\"tileImage\"/>)")[0]; //
        $(tileImage).css({ left: column * (-tileSize.x), top: row * (-tileSize.y), height: imageSize.y, width: imageSize.x });
        $(tileContainer).append(tileImage);

        var grp = -1;
        var groupedWithNeighbour = {
            left: false,
            right: false,
            top: false,
            bottom: false,
            all: false
        };

        var publicInterface = {
            UI: tileContainer,
            Row: row,
            Column: column,
            Group: grp,
            GroupedWithNeighbour: groupedWithNeighbour,
            Move: function (i_position) {
                $(tileContainer).css({ left: i_position.x, top: i_position.y });
                return this.tileContainer;
            },
            Scale: function (i_tileSize, i_imageSize) {
                $(tileContainer).css({ height: i_tileSize.y, width: i_tileSize.x });
                $(tileImage).css({ left: column * (-i_tileSize.x), top: row * (-i_tileSize.y), height: i_imageSize.y, width: i_imageSize.x });
                return this.tileContainer;
            },
            Destroy: function () {

            }
        }

        var _preventDefault = function (event) {
            event.preventDefault();
            return false;
        }

        $(tileImage).bind('contextmenu', _preventDefault);

        tileContainer.__tile__ = publicInterface;
        return publicInterface;
    };

    function Position(x, y) {
        this.x = x;
        this.y = y;
    };

    init = function () {
        if (!Array.indexOf) {
            Array.prototype.indexOf = function (query) {
                for (var i = 0; i < this.length; i++) {
                    if (this[i] == query)
                        return i;
                }
                return -1;
            }
        };
        $(canvas).addClass("maindiv");
        $(window).resize(onWindowResize);
        onWindowResize();

        launchSelectionScreen();
    };

    onWindowResize = function () {
        var canvasHeight, canvasWidth;
        canvasHeight = $(window).height() - $(".headercontainer").outerHeight(true);
        canvasHeight -= parseInt($(canvas).css("borderTopWidth")) + parseInt($(canvas).css("borderBottomWidth")) +
                        parseInt($(canvas).css("marginTop")) + parseInt($(canvas).css("marginBottom")) +
                        parseInt($(canvas).css("paddingTop")) + parseInt($(canvas).css("paddingBottom")) +
                        parseInt($("body").css("borderTopWidth")) + parseInt($("body").css("borderBottomWidth")) +
                        parseInt($("body").css("marginTop")) + parseInt($("body").css("marginBottom")) +
                        parseInt($("body").css("paddingTop")) + parseInt($("body").css("paddingBottom")) + 2;
        $(canvas).css("height", canvasHeight);

        canvasWidth = $(window).width();
        canvasWidth -= parseInt($(canvas).css("borderLeftWidth")) + parseInt($(canvas).css("borderRightWidth")) +
                        parseInt($(canvas).css("marginLeft")) + parseInt($(canvas).css("marginRight")) +
                        parseInt($(canvas).css("paddingLeft")) + parseInt($(canvas).css("paddingRight")) +
                        parseInt($("body").css("borderLeftWidth")) + parseInt($("body").css("borderRightWidth")) +
                        parseInt($("body").css("marginLeft")) + parseInt($("body").css("marginRight")) +
                        parseInt($("body").css("paddingLeft")) + parseInt($("body").css("paddingRight"));
        $(canvas).css("width", canvasWidth);
    }

    launchSelectionScreen = function () {
        if (!initScreen) {
            initScreen = $("<div class=\"menuCanvas\"></div>")[0];
            initScreen.menuButtonRandom = $("<a class=\"iconLink\" title=\"Random Friend Photo\"><\/a>")[0];
            $(initScreen).append(initScreen.menuButtonRandom);
            var context = this;
            $(initScreen.menuButtonRandom).bind("click", function (evt) {
                onRandomPicBtnClick(evt);
                return false;
            });
            $(canvas).append(initScreen);
        }
        $(initScreen).fadeIn("slow");
    };

    onRandomPicBtnClick = function () {
        $(initScreen).fadeOut();
        createPuzzleCanvas();
        fetchPic();
    };

    createPuzzleCanvas = function () {
        puzzleStatus = PUZZLE_STATUS.NO_RESULT;
        puzzleCanvas = $("<div class=\"puzzleCanvas\"></div>")[0];
        puzzle = new Puzzle(puzzleCanvas);
        var context = this;
        puzzle.addListener(Puzzle.onSuccess, function (evt) {
            context.showSuccess(evt);
            return false;
        });
        $(canvas).append(puzzleCanvas);
    };

    fetchPic = function () {
        puzzle.useImage("./images/Penguins.jpg");
    };

    showSuccess = function () {
        puzzleStatus = PUZZLE_STATUS.WON;
        if (!messageBox) {
            messageBox = $("<div class=\"messageBox\"><\/div>")[0];
            $("body").append(messageBox);
            $("<span class=\"successMessage\">Congratulations! You have cracked it!<\/span>").appendTo(messageBox);
            var continueButton = $("<a class=\"continueButton\">Continue<\/a>")[0];
            $(continueButton).appendTo(messageBox);
            var context = this;
            $(continueButton).bind("click", function (evt) {
                $(messageBox).fadeOut("fast");
                onFinalScreenDismissed(evt);
                return false;
            });
        }
        $(messageBox).fadeIn("fast");
    };

    onFinalScreenDismissed = function () {
        $(puzzleCanvas).remove();
        launchSelectionScreen();
    };

    return {
        setUp: function () {
            canvas = $("#canvas")[0];
            init();
        }
    };
})(jQuery);