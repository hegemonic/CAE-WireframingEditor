/*global y*/
import {
    mxGraph,
    mxEvent,
    mxGraphHandler,
    mxCodec,
    mxKeyHandler,
    mxRubberband,
    mxUtils,
    mxRectangle,
    mxGeometry,
    mxConstants,
    mxCodecRegistry
} from './misc/mxExport.js';
import Util from './misc/Util.js';
import UserOverlay from './overlays/UserOverlay.js';
import EditOverlay from './overlays/EditOverlay.js';
import EnableAwareness from './Awareness.js';
import WireframeLayout from './WireframeLayout.js';
import $ from 'jquery';
import CONST from './misc/Constants.js';
import HierachyTree from './HierachyTree.js';

window.mxGeometry = mxGeometry;
Wireframe.prototype = new mxGraph();
Wireframe.prototype.constructor = Wireframe;

function Wireframe(container, model) {
    var that = this;
    mxGraph.call(this, container, model);

    that.defaultOverlap = 0;
    that.foldingEnabled = false;
    that.autoExtend = false;
    that.allowAutoPanning = false;
    that.collapseToPreferredSize = false;
    that.extendParentsOnAdd = false;
    that.extendParents = false;
    that.setHtmlLabels(true);
    that.setTooltips(true); //enable tooltips for overlays
    this.dropEnabled = true;

    that.maximumGraphBounds = new mxRectangle(0, 0, 500, 500);
    //enable guiding lines
    mxGraphHandler.prototype.guidesEnabled = true;
    mxGraphHandler.prototype.highlightEnabled = true;

    //enables user highlighting and overlay for cells of the wireframe
    EnableAwareness(this);

    new mxKeyHandler(this);
    new mxRubberband(this);

    var sharedAction = null;
    var SharedCellsMovedEvent = function (wf, event) {
        var properties = event.getProperties();
        var cells = properties.cells;
        var ids = [];
        for (var i = 0; i < cells.length; i++) {
            ids.push(cells[i].id);
        }
        sharedAction = {
            userId: y.db.userId,
            dx: properties.dx,
            dy: properties.dy,
            ids: ids
        };
    };
    var SharedCellResizedEvent = function (graph, event) {
        //Proudly stolen from the docs
        var cells = event.getProperty('cells');
        var bounds = event.getProperty('bounds');
        if (cells != null) {
            for (var i = 0; i < cells.length; i++) {
                if (graph.getModel().getChildCount(cells[i]) > 0) {
                    var geo = graph.getCellGeometry(cells[i]);

                    if (geo != null) {
                        var children = graph.getChildCells(cells[i], true, true);
                        var bb = graph.getBoundingBoxFromGeometry(children, true);

                        geo = geo.clone();
                        geo.width = Math.max(geo.width, bb.width);
                        geo.height = Math.max(geo.height, bb.height);

                        graph.getModel().setGeometry(cells[i], geo);
                    }
                }
            }
            sharedAction = {
                userId: y.db.userId,
                ids: [],
                bounds: []
            };
            for (var i = 0; i < cells.length; i++) {
                sharedAction.ids.push(cells[i].id);
                sharedAction.bounds.push({
                    x: bounds[i].x,
                    y: bounds[i].y,
                    width: bounds[i].width,
                    height: bounds[i].height
                });
            }
        }

    };
    that.addListener(mxEvent.CELLS_MOVED, SharedCellsMovedEvent);
    that.addListener(mxEvent.CELLS_RESIZED, SharedCellResizedEvent);
    that.addListener(mxEvent.DOUBLE_CLICK, function (sender, evt) {
        var cell = evt.getProperty('cell');
        if (cell) {
            if (cell.hasOwnProperty('get$node')) {
                cell.get$node().css('pointer-events', 'auto');
                cell.get$node().focus();
            }
            //var e = evt.getProperty('event');
            //new PropertyEditor(cell, that, e.x, e.y);
        }
    });
    that.getSelectionModel().addListener(mxEvent.CHANGE, function (sender, event) {
        var deselected = event.getProperty('added');
        for (var i = 0; i < deselected.length; i++) {
            if (deselected[i].hasOwnProperty('get$node'))
                deselected[i].get$node().css('pointer-events', 'none');
                mxGraph.prototype.removeCellOverlay.call(that, deselected[i], deselected[i].getEditOverlay());
        }
        var selected = event.getProperty('removed');
        if (selected) {
            for (var i = 0; i < selected.length && selected[i]; i++) {
                var editOverlay = new EditOverlay();
                mxGraph.prototype.addCellOverlay.call(that, selected[i], editOverlay);
                editOverlay.bindClickEvent(that);
            }
        }
    });
    that.moveCells = function (cells, dx, dy, clone, target, evt, mapping, shared) {
        var cells = mxGraph.prototype.moveCells.apply(this, arguments);
        if (cells.length > 0 && sharedAction && !shared) {
            sharedAction.parentId = cells[0].parent.id;
            y.share.action.set(mxEvent.MOVE, sharedAction);
            sharedAction = null;
        }
        return cells;
    };

    that.resizeCells = function (cells, bounds, recurse, shared) {
        var cells;
        that.getModel().beginUpdate();
        try {
            cells = mxGraph.prototype.resizeCells.apply(this, arguments);
        } finally {
            that.getModel().endUpdate();
            that.updateBounds();
        }
        if (cells && cells.length > 0 && sharedAction && !shared) {
            y.share.action.set(mxEvent.RESIZE, sharedAction);
            sharedAction = null;

        }
        return cells;
    };

    that.addCellOverlay = function (cell, overlay, fromSyncMeta) {
        if (overlay instanceof UserOverlay || overlay instanceof EditOverlay) {
            mxGraph.prototype.addCellOverlay.apply(this, arguments);
        } else {
            y.share.action.set(mxEvent.ADD_OVERLAY, {
                userId: y.db.userId,
                id: cell.getId(),
                xml: overlay.toXML(),
                fromSyncMeta : !fromSyncMeta ? false : true
            });
        }
    };

    that.updateBounds = function () {
        var bounds = that.getBoundingBox(that.getDefaultParent().children);
        if(bounds){
            $('#wireframeWrap').resizable('option', 'minWidth', bounds.x + bounds.width);
            $('#wireframeWrap').resizable('option', 'minHeight', bounds.y + bounds.height);
        }
    };

    //------------------------------------------------------------------------------------------------------------------------
    //--------------------------------------Begin Yjs Observer for actions----------------------------------------------------
    //------------------------------------------------------------------------------------------------------------------------
    y.share.action.observe(function (event) {
        switch (event.name) {
            case mxEvent.ADD_VERTEX:
                {
                    var doc = mxUtils.parseXml(event.value.data);
                    var codec = new mxCodec(doc);
                    var elt = doc.documentElement.childNodes[1];
                    var cells = [];
                    while (elt != null) {
                        var cell = codec.decode(elt);
                        cell.setId(event.value.id);
                        if (cell.hasOwnProperty('initDOM')) cell.initDOM();
                        cells.push(cell);
                        elt = elt.nextSibling;
                    }
                    that.getModel().beginUpdate();
                    try {
                        if (event.value.parent)
                            that.addCells(cells, that.getModel().getCell(event.value.parent));
                        else
                            that.addCells(cells);

                    }
                    finally {
                        that.getModel().endUpdate();
                        if (!event.value.parent)
                            that.updateBounds();
                    }
                    HierachyTree.add(cell);
                    for (var i = 0; i < cells.length; i++) {
                        cells[i].createShared(event.value.userId === y.db.userId);
                    }
                    if (event.value.userId === y.db.userId) {
                        that.setSelectionCells(cells);
                        $('#wireframe').focus();
                    }

                    break;
                }
            case mxEvent.MOVE:
                {
                    var parent = that.getModel().getCell(event.value.parentId);
                    if (event.value.userId !== y.db.userId) {
                        that.removeListener(SharedCellsMovedEvent);
                        var cells = Util.getCellsFromIdList(that, event.value.ids);
                        if (cells.length > 0) {
                            if (event.value.dx != 0 || event.value.dy != 0)
                                that.moveCells(cells, event.value.dx, event.value.dy, false, parent, null, null, true);
                        }
                        that.addListener(mxEvent.CELLS_MOVED, SharedCellsMovedEvent);
                    }
                    HierachyTree.move(event.value.ids, event.value.parentId, parent.children.length);
                    that.updateBounds();
                    break;
                }
            case mxEvent.RESIZE:
                {
                    if (event.value.userId !== y.db.userId) {
                        that.removeListener(SharedCellResizedEvent);
                        var cells = Util.getCellsFromIdList(that, event.value.ids);
                        var bounds = [];
                        for (var i = 0; i < event.value.bounds.length; i++) {
                            var bound = event.value.bounds[i];
                            bounds.push(new mxRectangle(bound.x, bound.y, bound.width, bound.height));
                        }
                        if (cells.length > 0) {
                            that.getModel().beginUpdate();
                            try {
                                that.resizeCells(cells, bounds, false, true);
                            } finally {
                                that.getModel().endUpdate();
                                that.updateBounds();
                                that.addListener(mxEvent.CELLS_RESIZED, SharedCellResizedEvent);
                            }
                        }
                    }

                    break;
                }
            case mxEvent.ADD_OVERLAY:
                {
                    var doc = mxUtils.parseXml(event.value.xml);
                    var codec = new mxCodec(doc);
                    codec.decode = function (node, into) {
                        var obj = null;
                        if (node != null && node.nodeType == mxConstants.NODETYPE_ELEMENT) {
                            var dec = mxCodecRegistry.getCodec(node.nodeName);
                            if (dec != null) {
                                obj = dec.decode(this, node, into);
                            } else {
                                obj = node.cloneNode(true);
                                obj.removeAttribute('as');
                            }
                        }
                        return obj;
                    };
                    var tag = codec.decode(doc.documentElement);

                    var cell = that.getModel().getCell(event.value.id);
                    if (cell && tag) {
                        mxGraph.prototype.addCellOverlay.apply(that, [cell, tag]);
                        cell.addTag(tag);
                        tag.setCell(cell);
                        if(tag.hasOwnProperty('initAttributes')) tag.initAttributes();
                        tag.createShared(y.db.userId === event.value.userId);
                        tag.bindClickEvent(that);
                        var ref = $('#' + cell.getId() + '_tagTree').jstree(true);
                        if (ref) {
                            ref.create_node(null, {
                                id: tag.tagObj.getAttribute('id'),
                                type:  tag.tagObj.getAttribute('tagType'),
                                text: tag.constructor.Alias || tag.tagObj.getAttribute('tagType'),
                                state: {
                                    selected: false,
                                    opened: true
                                }
                            });
                            //if (sel) ref.edit(sel);
                        }
                    }
                    break;
                }
            case CONST.ACTIONS.MOVE_TAG:
                {
                    if (event.value.userId !== y.db.userId) {
                        $('#' + event.value.cellId + '_tagTree').jstree(true).move_node(event.value.node, event.value.parent, event.value.position);
                    }
                    var cell = that.getModel().getCell(event.value.cellId);
                    var tag = cell.getTagById(event.value.node);
                    cell.removeTagById(tag.getId());
                    tag.tagObj.setAttribute('parent', event.value.parent);
                    if (event.value.parent !== '#') {
                        var parentTag = cell.getTagById(event.value.parent);
                        parentTag.addChildTag(tag);
                    }
                    cell.addTag(tag);
                    break;
                }
            case CONST.ACTIONS.DELETE_TAG:
                {
                    var $tree = $('#' + event.value.cellId + '_tagTree');
                    if ($tree.length > 0)
                        $tree.jstree(true).delete_node(event.value.selected);
                    //delete attribute form of the tag
                    $('#propertyEditor_' + event.value.cellId).find('.tagAttribute').parent().remove();
                    var cell = that.getModel().getCell(event.value.cellId);
                    if (cell) {
                        for (var i = 0; i < event.value.selected.length; i++) {
                            var id = event.value.selected[i];
                            for (var j = 0; cell.overlays && j < cell.overlays.length; j++) {
                                var tag = cell.overlays[j];
                                if (tag.hasOwnProperty('tagObj') && tag.tagObj.getAttribute('id') === id) {
                                    that.removeCellOverlay(cell, tag);
                                    cell.removeTagById(id);
                                    var removeAllChilds = function (cell, tag) {
                                        //remove childs
                                        var childs = tag.getChildTags();
                                        for (var key in childs) {
                                            if (childs.hasOwnProperty(key)) {
                                                cell.removeTagById(key);
                                                that.removeCellOverlay(cell, childs[key]);
                                                removeAllChilds(cell, childs[key]);
                                            }
                                        }
                                    }
                                    removeAllChilds(cell, tag);
                                }
                            }
                        }
                        var k = 0;
                        var state = that.view.getState(cell);
                        if (state.overlays) {
                            for (var o in state.overlays.map) {
                                var tag = state.overlays.map[o].overlay;
                                if (tag.constructor.name !== 'UserOverlay' || tag.constructor.name !== 'EditOverlay') {
                                    tag.offset.x = -k * CONST.TAG.SIZE;
                                    k++;
                                }
                            }
                            that.cellRenderer.redraw(state);
                        }

                    }

                    break;
                }
            case CONST.ACTIONS.RENAME_TAG:
                {
                    //TODO
                    break;
                }
            case CONST.ACTIONS.SHARED.APPLY_LAYOUT: {
                var layout = new WireframeLayout(that, false);
                layout.resizeVertices = false;
                if (event.value.cellId)
                    layout.execute(that.getModel().getCell(event.value.cellId));
                else
                    layout.execute(that.getDefaultParent());
                break;
            }
        }
        if (event.value.userId === y.db.userId)
            Util.Save(that);
    });
    //------------------------------------------------------------------------------------------------------------------------
    //--------------------------------------End Yjs Observer for actions------------------------------------------------------
    //------------------------------------------------------------------------------------------------------------------------

    that.convertValueToString = function (cell) {
        if (mxUtils.isNode(cell.value)) {
            if (cell.hasOwnProperty('get$node')) {
                if (!cell.get$node()) cell.initDOM();
                mxEvent.addListener(cell.get$node()[0], 'change', function () {
                    var elt = cell.value.cloneNode(true);
                    elt.setAttribute('label', cell.get$node().val());
                    that.model.setValue(cell, elt);
                    Util.Save(that);
                });
                cell.get$node().css('width', cell.geometry.width - 15).css('height', cell.geometry.height - 15);

                switch (cell.value.getAttribute('uiType').toLowerCase()) {
                    case 'link':
                    case 'textbox':
                    case 'button':
                    case 'textnode':
                        {
                            cell.get$node().click(function () {
                                that.getSelectionModel().setCell(cell);
                            });
                            break;
                        }
                    case 'paragraph':
                    case 'textarea':
                        {
                            cell.get$node().click(function () {
                                this.focus();
                                this.setSelectionRange(this.value.length, this.value.length);
                            });

                            cell.get$node().dblclick(function () {
                                this.focus();
                                this.setSelectionRange(0, this.value.length);
                            })
                            break;
                        }
                    case 'radiobutton':
                    case 'checkbox':
                        {
                            cell.get$node().find('input[type="input"]').click(function () {
                                that.getSelectionModel().setCell(cell);
                            });
                            break;
                        }
                }
                return cell.get$node()[0];
            }
        }
    }
}
export default Wireframe;