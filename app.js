'use strict';

angular.module('SvgCropperApp', [])
.run(function() {
  // Init code
})
.controller('CropperCtrl', function($scope,$http,svgCropper) {

    var element = $('#svgarea');

    var svg_el = null;

    $scope.fname = 'untitled';
    $scope.mode = 'remove';
    $scope.padding = 5;
    $scope.no_pad_bottom = true;

    $scope.loadSvg = function(file) {
      
      $scope.fname = file.name.split('.')[0];
      var url = URL.createObjectURL(file);

      $http({method:'GET', url: url, responseType:'document'}).then(function(res) {
        console.log("RESULT",res,res.data);
        var el = res.data.documentElement;

        element.empty();
        element[0].appendChild(el);
        svg_el = el;
      });
    };

    var down = null;

    var selrect = null;

    var twoPtsToRect = function(p1,p2) {
      var x = Math.min(p1.x,p2.x),
          y = Math.min(p1.y,p2.y);
      var w = Math.max(p1.x,p2.x) - x, 
          h = Math.max(p1.y,p2.y) - y;

      return {x: x, y: y, width: w, height: h};
    };

    $scope.save = function(fname,svg) {
        svg = svg || svg_el;
        fname = fname || $scope.fname;
        var oSerializer = new XMLSerializer();
        var sXML = oSerializer.serializeToString(svg);
        var xblob = new Blob([sXML], {type : 'text/xml'});
        saveAs(xblob,fname+'.svg');
    };

    $scope.undo_list = [];

    $scope.mousefn = function(cx,cy,state) {
      if (state=='down') {

        if ($scope.mode=='split') {
          var nel = svg_el.cloneNode(true);
          $scope.undo_list.push(nel);
          split(cy);
          return;
        }

        down = { x: cx, y: cy };
        selrect = $('<div></div>').css({
          background: 'red', opacity:0.3,
          position: 'fixed',
          top:cy, left:cx, width:0, height:0
        });
        $('body').append(selrect);
        return;
      }
      
      if (!down) return;
      var r = twoPtsToRect({x:cx,y:cy},down);

      if (state=='drag') {
        selrect.css({ top: r.y, left: r.x,
          width: r.width, height: r.height
        });
      }
      else if (state=='up') {
        var nel = svg_el.cloneNode(true);
        $scope.undo_list.push(nel);

        if ($scope.mode == 'remove') svgCropper.crop(svg_el,r);
        else if ($scope.mode == 'crop') crop(r);
        
        down = null;
        selrect.remove();
        $scope.$apply();
      }
    };

    var cBBtoVB = function(svg_el, r) {
      var vb = _.map(svg_el.getAttribute('viewBox').split(' '),Number);
      var bcr = svg_el.getBoundingClientRect();

      var x = vb[0] + vb[2]*(r.x-bcr.left)/bcr.width;
      var y = vb[1] + vb[3]*(r.y-bcr.top)/bcr.height;
      var w = vb[2]*r.width/bcr.width;
      var h = vb[3]*r.height/bcr.height;

      //console.log("VIEWBOX",vb,[x,y,w,h]);

      var aw = element.width();

      svg_el.setAttribute('viewBox', [x,y,w,h].join(' '));
      svg_el.setAttribute('width',aw);
      svg_el.setAttribute('height',aw*h/w);
    };

    var crop = function(r) {
      //console.log("CROP R",r);
      r.reversed = true;
      svgCropper.crop(svg_el,r);
      cBBtoVB(svg_el,r);
    };

    $scope.split_counter = 1;

    var split = function(split_y) {
      var bcr = svg_el.getBoundingClientRect();
      split_y -= bcr.top;
      var r = {x: bcr.left, y: bcr.top, width: bcr.width, height: split_y};
      //console.log("SPLIT WITH",r);

      var nel = svg_el.cloneNode(true);
      crop(r);
      $scope.save($scope.fname + $scope.split_counter);
      element.empty();
      element[0].appendChild(nel);
      svg_el = nel;
      r.y+=split_y; r.height=bcr.height-split_y;
      crop(r);

      $scope.split_counter++;
    };

    $scope.tight = function(padding) {
      var nel = svg_el.cloneNode(true);
      $scope.undo_list.push(nel);

      var tbb = svgCropper.tightBB(svg_el);
      var r = {
        x:tbb.l, y:tbb.t,
        width:tbb.r-tbb.l, height: tbb.b-tbb.t
      };
      var apad = r.width*(padding/100.0);
      r.x-=apad; r.y-=apad; r.width+=2*apad; 
      r.height+=apad*($scope.no_pad_bottom?1:2); 

      cBBtoVB(svg_el,r);
    };


    $scope.undo = function(all) {
      if ($scope.undo_list.length == 0) return;
      var el = all?$scope.undo_list[0]:$scope.undo_list.pop();
      if (all) $scope.undo_list = [];

      element.empty();
      element[0].appendChild(el);
      svg_el = el;
    };

})
.factory('svgCropper',function() {

  var relation = function(rect,bb) {
    if ((!rect.reversed &&
        rect.x<=bb.x && rect.y<=bb.y &&
        rect.x+rect.width>=bb.x+bb.width &&
        rect.y+rect.height>=bb.y+bb.height)
      ||
        (rect.reversed && 
        (rect.x>=bb.x+bb.width || rect.y>=bb.y+bb.height ||
        rect.x+rect.width<=bb.x ||rect.y+rect.height<=bb.y
        )))
      return 'covers';
    else if (rect.x<bb.x+bb.width && bb.x < rect.x+rect.width &&
              rect.y<bb.y+bb.height && bb.y < rect.y+rect.height)
      return 'intersects';
    else return 'independent';
  };

  var BCRtoBB = function(bcr) {
    return { x:bcr.left,y:bcr.top,width:bcr.width,height:bcr.height };
  };

  var crop = function(svg,rect) {
    //console.log("CaLLED CROP",svg,rect);
    console.log("SVG TYPE",svg.nodeName);
    if (!svg.children) return;

    var to_remove = [];
    _.each(svg.children,function(node) {
      if (node.nodeName=='defs') return;
      var bbox = BCRtoBB(node.getBoundingClientRect());
      var rel = relation(rect,bbox);
      //node.setAttribute('bb',rel+JSON.stringify(bbox));  // Debug in DOM
      //console.log("CROP Traverse",bbox,rect,rel,node);

      if (rel=='covers') to_remove.push(node);
      else if ((rel=='intersects') && node.children)
        crop(node,rect);
    });

    _.each(to_remove,function(node) { node.remove(); });
  };

  var tightBB = function(svg) {
    var res = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
    _.each(svg.children,function(node) {
      if (node.nodeName=='defs') return;
      var bcr = node.getBoundingClientRect();
      if (bcr.width == 0 && bcr.height==0){
        var nbb = tightBB(node);
        res.l = Math.min(res.l,nbb.l);
        res.r = Math.max(res.r,nbb.r);
        res.t = Math.min(res.t,nbb.t);
        res.b = Math.max(res.b,nbb.b);
      }
      else {
        res.l = Math.min(res.l,bcr.left);
        res.r = Math.max(res.r,bcr.right);
        res.t = Math.min(res.t,bcr.top);
        res.b = Math.max(res.b,bcr.bottom);
      }
    });
    return res;
  };

  return {
    crop: crop,
    tightBB: tightBB
  };
})

// http://stackoverflow.com/questions/17063000/ng-model-for-input-type-file
.directive("fileread", [function () {
    return {
        scope: {
            fileread: "="
        },
        link: function (scope, element, attributes) {
            element.bind("change", function (changeEvent) {
                scope.$apply(function () {
                    scope.fileread(changeEvent.target.files[0]);
                });
            });
        }
    };
}])


.directive('graphMouse',function() {
    var linker = function(scope, element, attrs) {
      var el = $(element)[0];
      var callback = false;

      var react = function(status) {
        return function(evt) {
          console.log("WHICH",evt.which);
          callback = callback || scope.$eval(attrs.graphMouse);
          if (!callback || evt.which != 1) return;

          var rect = el.getBoundingClientRect();

          var px = evt.pageX-window.pageXOffset,
              py = evt.pageY-window.pageYOffset;
          callback(px,py,status);
        };
      };

      var running = false;
      // Do "react" on dragging
      var listener = function(evt) {
        //console.log(evt.type, running, mousedown_which_status,el);
        if (running) return;
        if (evt.type!='mousedown') return;
        running = true;
        var full_area = window;//document.body;
        var drag = react('drag');
        full_area.addEventListener('mousemove',drag);
        var mup = function(evt) {
            react('up')(evt);
            full_area.removeEventListener('mousemove',drag);
            full_area.removeEventListener('mouseup',mup);
            running = false;
        };
        full_area.addEventListener('mouseup',mup);
        
        react('down')(evt);
      };

      el.addEventListener('mousedown',listener, false);
    };
    return {
      restrict: 'A',
      // uses mouseCb, but does not drag them to separate scope
      link: linker
    };
  });