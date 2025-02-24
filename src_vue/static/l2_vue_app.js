let vueApp = new Vue({
  el: "#vue-app",
  template: `
  <div>
  <b-overlay :show="overlay_main" rounded="sm" spinner-type="border" spinner-variant="dark">
  <div id="graph2" class="svg-container"></div>
  </b-overlay>
  <frame-navbar></frame-navbar>
  <frame-sidebargraph></frame-sidebargraph>
  <frame-sidebarclustertime></frame-sidebarclustertime>
  <feature-sidebaredge></feature-sidebaredge>
  <feature-sidebarnode></feature-sidebarnode>
  <feature-sidebarcluster></feature-sidebarcluster>
  <text-example></text-example>
  </div>
    `,
  /**
   * vueData is one of three data-objects objects in the global scope: vueData, graph and d3Data
   * vueData is specific to the VueApp - it is included here to make it reactive
   * ( graph refers to the global graph-model, d3Data  refers to specific data for d3)
   */
  data: vueData,
  computed: {},
  methods: {
    /**
     * helper
     */
    getKeyByValue(object, value) {
      return Object.keys(object).find((key) => object[key] === value);
    },

    /*
        / ############ GRAPH CREATION UPDATE DELETE FUNCTIONS WHERE vueAPP acts as linkage between components
        */
    loadNew: async function (data_from_db) {
      vueApp.graph_rendered = false;
      vueApp.overlay_main = true;
      // nodes and links should be released from d3
      if (d3Data.d_simulation) {
        d3Data.d_simulation.stop();
      }
      await delete_graph();
      // delete additional data storage locations
      vueApp.graph_clusters = [];
      d3Data.links = [];
      // attach to graph - assign per nested object
      graph.nodes = data_from_db.nodes;
      graph.links = data_from_db.links;
      graph.singletons = data_from_db.singletons;
      graph.props = data_from_db.props;
      graph.clusters = data_from_db.clusters;
      graph.transit_links = data_from_db.transit_links;
      console.log(" new prop ", graph.props.collection_key);
      console.log(" loaded names in vueApp", vueApp.collections);
      // new copy back to vue app props
      for (let collection_obj_key in vueApp.collections) {
        console.log("iterating col obj keys", collection_obj_key);
        if (
          vueApp.collections[collection_obj_key].key ===
          graph.props.collection_key
        ) {
          vueApp.collection_name = collection_obj_key;
          vueApp.collection_key = graph.props.collection_key;
          break;
        }
      }
      console.log("collection name", vueApp.collection_name);
      vueApp.onChangeDb();
      vueApp.start_year = graph.props["start_year"];
      vueApp.end_year = graph.props["end_year"];
      // user input: graph props
      // here is a naming confusion
      // in the frontend vueApp the real key is the name - this is stored in vueApp.graph_type
      // in the graph.props the graph.props.graph_type refers to the string, such as "ngot-interval" that is the value in the FE
      // Thus - graph_type != graph_type
      vueApp.target_word = graph.props["target_word"];
      vueApp.graph_type = this.getKeyByValue(
        vueApp.graph_type_keys,
        graph.props.graph_type
      );
      console.log(vueApp.graph_type);
      vueApp.onChangeDb();
      vueApp.n_nodes = graph.props["n_nodes"];
      vueApp.density = graph.props["density"];

      // clean up of data - python cannot use the reserved word "class"
      // execute mapping to node attribute "class" : "cluster_id" -> "class"
      for (let node of graph.nodes) {
        node.class = node.cluster_id;
      }
      // copy target and source to source-Text and target-text: d3 force is working on them
      for (let link of graph.links) {
        link.target_text = link.target;
        link.source_text = link.source;
      }
      // // link graph.singletons to app
      vueApp.singletons = data_from_db.singletons;
      vueApp.graph_clusters = data_from_db.clusters;
      // prep cluster data
      for (let cluster of vueApp.graph_clusters) {
        if (!cluster.colour) {
          cluster.colour = color(cluster.cluster_id);
        } else {
          for (let node in graph.nodes) {
            if (node.cluster_id == cluster.cluster_id) {
              node.colour = cluster.colour;
            }
          }
        }
        cluster.opacity = vueApp.node_fill_opacity;
      }

      // dictionaries
      for (let node of graph.nodes) {
        vueApp.node_dic[node.id] = node;
      }
      vueApp.link_dic = {};
      for (let link of graph.links) {
        vueApp.link_dic[link.id] = link;
      }
      vueApp.cluster_dic = {};
      for (let cluster of graph.clusters) {
        vueApp.cluster_dic[cluster.cluster_id] = cluster;
      }
      // update hidden
      for (let cluster of graph.clusters) {
        for (let link of graph.links) {
          if (
            cluster.add_cluster_node &&
            cluster.cluster_id == link.cluster_id
          ) {
            link.hidden = false;
          } else if (
            !cluster.add_cluster_node &&
            link.cluster_link &&
            cluster.cluster_id == link.cluster_id
          ) {
            link.hidden = true;
          }
        }
      }
      // update colour of nodes
      for (let node of graph.nodes) {
        let tmp = vueApp.cluster_dic[node.cluster_id];
        if (tmp && tmp.colour) {
          node["colour"] = tmp.colour;
        }
      }

      // and deep copy of links to d3 - it works on these data and modifies them
      d3Data.links = JSON.parse(JSON.stringify(graph.links));
      // update hidden of cluster links
      await graph_init();
      await graph_crud(graph.nodes, d3Data.links, graph.clusters);
      this.applyClusterSettings();
      sticky_change_d3();
      vueApp.graph_rendered = true;
      vueApp.overlay_main = false;
      return "ok";
    },

    // on change database in frontend - update function
    onChangeDb() {
      this.collection_key = this.collections[this.collection_name]["key"];
      this.target_word = this.collections[this.collection_name]["target"];
      this.n_nodes = this.collections[this.collection_name]["p"];
      this.density = this.collections[this.collection_name]["d"];
      this.collection_info = this.collections[this.collection_name]["info"];
      // console.log("in onchange db" + this.collection_key);
      // console.log("in onchange db" + this.collection_name);

      // async
      this.getStartYears();
      this.getEndYears();
    },
    // init graph_types
    getGraphTypes() {
      this.graph_types = Object.keys(this.graph_type_keys);
      this.graph_type = this.graph_types[0];
    },
    // init collections from axios
    getCollections() {
      getCollections_io();
    },
    getStartYears() {
      // Vue dropdown needs text and value
      this.start_years = this.collections[this.collection_name]["start_years"];
      this.start_year = this.start_years[0]["value"];
    },
    getEndYears() {
      this.end_years = this.collections[this.collection_name]["end_years"];
      this.end_year = this.end_years[this.end_years.length - 1]["value"];
    },

    manual_recluster: async function () {
      vueApp.overlay_main = true;
      vueApp.graph_rendered = false;
      vueApp.wait_rendering = true;
      d_simulation.stop();
      await manual_recluster_io();
      graph_crud(graph.nodes, d3Data.links, graph.cluster);
      // this.restart_change();
      this.applyClusterSettings();
      d_simulation.restart();
      //vueApp.get_clusters();
      vueApp.graph_rendered = true;
      vueApp.overlay_main = false;
      vueApp.wait_rendering = false;
    },
    /*
		  Reset all the nodes make to their original size
		  */
    resetCentralityHighlighting() {
      restart();
    },
    // creates the string of the tooltip
    selectInterval(time_ids, weights) {
      let intervalString = "";

      for (let index = 0; index < time_ids.length; index++) {
        let start = this.start_years[time_ids[index] - 1].text;
        let end = this.end_years[time_ids[index] - 1].text;
        intervalString +=
          start + " - " + end + " [" + weights[index] + "]" + "<br>";
      }
      return intervalString;
    },
    // check the dictionary to see if nodes are linked
    isConnected(a, b) {
      // console.log("in is connected with a.id, b.id", a, b);
      return (
        vueApp.link_dic[a.id + "-" + b.id] ||
        vueApp.link_dic[b.id + "-" + a.id] ||
        a.id == b.id
      );
    },
    /*
		  Apply changes in cluster name and colour to all the nodes in the graph (when pressing the "Apply" button in the edit column)
		  Data Changes---
		  */
    applyClusterSettings() {
      // needs node map
      let node_dic = {};
      for (let node of graph.nodes) {
        node_dic[node.id] = node;
      }
      // console.log("in apply cluster settings");
      // console.log("node_dic", node_dic);

      for (let cluster of vueApp.graph_clusters) {
        // apply name changes - name has twoway-binding
        // needs applying to cluster node (which is now in nodes)
        cluster.cluster_info_node.target_text = cluster.cluster_name;
        cluster.cluster_info_node.colour = cluster.colour;
        let tmp = node_dic[cluster.cluster_id];
        tmp.colour = cluster.colour;
        tmp.target_text = cluster.cluster_name;
        for (let node of cluster.cluster_nodes) {
          // apply colour changes
          // needs applying to cluster node and all nodes
          //console.log(node);
          tmp = node_dic[node];
          // console.log("tmp", tmp);
          tmp.colour = cluster.colour;
        }

        // apply cluster label visible

        for (let node of graph.nodes) {
          if (node.cluster_node && node.cluster_id == cluster.cluster_id) {
            node.hidden = !cluster.add_cluster_node;
          }
        }
        for (let link of d3Data.links) {
          if (link.cluster_link && link.cluster_id == cluster.cluster_id) {
            link.hidden = !cluster.add_cluster_node;
          }
        }
        console.log(cluster.add_cluster_node, cluster.cluster_id);
        // console.log(d3Data.links);
      }
      // needs applying to
      restart();
    },

    /*
    Get edge information, i.e. the feature-contexts words that are shared by paradigms
    Since we are using similarity - bims (ie contexts) - the function is called simbim
    */
    getSimBims() {
      getSimBims_io();
    },
    /*
        Get node-target word (invisible edge) information, i.e. the feature-contexts words that are shared by paradigms
        Since we are using similarity - bims (ie contexts) - the function is called simbim
        */
    getSimBimsNodes() {
      getSimBimsNodes_io();
    },
  },
  // ######################   APP STATE  ------------------------------------------------------------------------------
  // gets collections from backend at startup and inits svg
  mounted() {
    this.getCollections();
  },
  created() {},
});
