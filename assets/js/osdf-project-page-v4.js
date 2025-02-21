---
    layout: blank
---

import ElasticSearchQuery, {ADSTASH_ENDPOINT, DATE_RANGE, ADSTASH_SUMMARY_INDEX} from "./elasticsearch-v1.js";
import {
    GraccDisplay,
    locale_int_string_sort,
    string_sort,
    hideNode,
    formatBytes,
    sortByteString,
    localeIntToInt, byteStringToBytes
} from "./util.js";
import Color from "https://colorjs.io/dist/color.js";
import {PieChart} from "./components/pie-chart.js";

const orange = new Color("#f4b627")
const white = new Color("#ffffff")
const whiteorange = orange.range("#ffffff", {
    space: "lch", // interpolation space
    outputSpace: "srgb"
})


function makeDelay(ms) {
    let timer = 0;
    return function(callback){
        clearTimeout (timer);
        timer = setTimeout(callback, ms);
    };
}

const EPSCOR_STATES = [
    "AL", // Alabama
    "AK", // Alaska
    "AR", // Arkansas
    "DE", // Delaware
    "GU", // Guam
    "HI", // Hawaii
    "ID", // Idaho
    "IA", // Iowa
    "KS", // Kansas
    "KY", // Kentucky
    "LA", // Louisiana
    "ME", // Maine
    "MS", // Mississippi
    "MT", // Montana
    "NE", // Nebraska
    "NV", // Nevada
    "NH", // New Hampshire
    "NM", // New Mexico
    "ND", // North Dakota
    "OK", // Oklahoma
    "PR", // Puerto Rico
    "RI", // Rhode Island
    "SC", // South Carolina
    "SD", // South Dakota
    "VI", // U.S. Virgin Islands
    "VT", // Vermont
    "WV", // West Virginia
    "WY"  // Wyoming
];

const COMMON_FIELDS = [
		"MajorFieldOfScience",
    "BroadFieldOfScience",
    "DetailedFieldOfScience",
    "ProjectInstitution.name",
    "ProjectInstitution.ipeds_metadata.website_address",
    "ProjectInstitution.ipeds_metadata.historically_black_college_or_university",
    "ProjectInstitution.ipeds_metadata.tribal_college_or_university",
    "ProjectInstitution.ipeds_metadata.state"
]

/**
 * A suite of Boolean functions deciding the visual status of a certain grafana graph
 *
 * true results in the graph being shown, false the opposite
 */
const elasticSearch = new ElasticSearchQuery(ADSTASH_SUMMARY_INDEX, ADSTASH_ENDPOINT)

class UsageToggles {

    static async getUsage() {
        if (this.usage) {
            return this.usage
        }

        let usageQueryResult = await elasticSearch.search({
            size: 0,
            query: {
                range: {
                    Date: {
                        lte: DATE_RANGE['now'],
                        gte: DATE_RANGE['oneYearAgo']
                    }
                }
            },
            "aggs": {
                "projects": {
                    "terms": {
                        "field": "ProjectName.keyword",
                        "size": 10000
                    },
                    "aggs": {
                        "NumJobs": {
                            "sum": {
                                "field": "NumJobs"
                            }
                        },
                        "FileTransferCount": {
                            "sum": {
                                "field": "FileTransferCount"
                            }
                        },
                        "ByteTransferCount": {
                            "sum": {
                                "field": "ByteTransferCount"
                            }
                        },
                        "CpuHours": {
                            "sum": {
                                "field": "CpuHours"
                            }
                        },
                        "GpuHours": {
                            "sum": {
                                "field": "GpuHours"
                            }
                        },
                        "OSDFFileTransferCount": {
                            "sum": {
                                "field": "OSDFFileTransferCount"
                            }
                        },
                        "OSDFByteTransferCount": {
                            "sum": {
                                "field": "OSDFByteTransferCount"
                            }
                        },
                        "CommonFields": {
                            "top_hits": {
                                "_source": {
                                    "includes": COMMON_FIELDS
                                },
                                "size": 1
                            }
                        }
                    }
                }
            }
        })

        let projectBuckets = usageQueryResult.aggregations.projects.buckets

        try {
            this.usage = projectBuckets.reduce((p, v) => {

                // If the project is not mapped skip it
                if(v['CommonFields']['hits']['hits'][0]['_source']['ProjectInstitution']?.['name'] === undefined){
                    return p
                }

                p[v['key']] = {
                    projectName: v['key'],
                    numJobs: v['NumJobs']['value'],
                    cpuHours: v['CpuHours']['value'],
                    gpuHours: v['GpuHours']['value'],
                    fileTransferCount: v['FileTransferCount']['value'],
                    byteTransferCount: v['ByteTransferCount']['value'],
                    osdfFileTransferCount: v['OSDFFileTransferCount']['value'],
                    osdfByteTransferCount: v['OSDFByteTransferCount']['value'],
                    broadFieldOfScience: v['CommonFields']['hits']['hits'][0]['_source']['BroadFieldOfScience'],
                    majorFieldOfScience: v['CommonFields']['hits']['hits'][0]['_source']['MajorFieldOfScience'],
                    detailedFieldOfScience: v['CommonFields']['hits']['hits'][0]['_source']['DetailedFieldOfScience'],
                    projectInstitutionName: v['CommonFields']['hits']['hits'][0]['_source']['ProjectInstitution']?.['name'],
                    projectInstitutionIpedsWebsiteAddress: v['CommonFields']['hits']['hits'][0]['_source']?.['ProjectInstitution']?.['ipeds_metadata']?.['website_address'],
                    projectInstitutionIpedsHistoricallyBlackCollegeOrUniversity: v['CommonFields']['hits']['hits'][0]['_source']?.['ProjectInstitution']?.['ipeds_metadata']?.['historically_black_college_or_university'],
                    projectInstitutionIpedsTribalCollegeOrUniversity: v['CommonFields']['hits']['hits'][0]['_source']?.['ProjectInstitution']?.['ipeds_metadata']?.['tribal_college_or_university'],
                    projectInstitutionIpedsState: v['CommonFields']['hits']['hits'][0]['_source']?.['ProjectInstitution']?.['ipeds_metadata']?.['state'],
                    projectEpscorState: EPSCOR_STATES.includes(v['CommonFields']['hits']['hits'][0]['_source']?.['ProjectInstitution']?.['ipeds_metadata']?.['state'])
                }
                return p
            }, {})
        } catch(e){
            console.log(e)
        }

        console.log(this.usage)

        return this.usage
    }
}

const GRAFANA_PROJECT_BASE_URL = "https://gracc.opensciencegrid.org/d-solo/tFUN4y44z/projects"
const GRAFANA_BASE = {
    orgId: 1,
    from: DATE_RANGE['oneYearAgo'],
    to: DATE_RANGE['now']
}


class ProjectCount {
    constructor(dataGetter, node) {
        this.node = node
        this.dataGetter = dataGetter
        this.update()
    }

    update = async () => {
        let data = await this.dataGetter()
        this.node.textContent = Object.keys(data).length
        console.log(Object.keys(data).length)
    }
}

class Search {
    constructor(data, listener) {
        this.node = document.getElementById("project-search")
        this.listener = listener
        this.timer = undefined
        this.node.addEventListener("input", this.search)
        this.lunr_idx = lunr(function () {
            this.ref('Name')
            this.field('Department')
            this.field('Description')
            this.field('FieldOfScience')
            this.field('ID')
            this.field('Name')
            this.field('Organization')
            this.field('PIName')
            this.field('ResourceAllocations')

            data.forEach(function (doc) {
                this.add(doc)
            }, this)
        })
    }
    search = () => {
        clearTimeout(this.timer)
        this.timer = setTimeout(this.listener, 250)
    }
    filter = (data) => {
        if(this.node.value == ""){
            return data
        } else {
            console.log(this.node.value)
            let table_keys = this.lunr_idx.search("" + this.node.value + "~2").map(r => r.ref)
            return table_keys.reduce((pv, k) => {
                pv[k] = data[k]
                return pv
            }, {})
        }
    }
}

class Table {
    constructor(wrapper, data_function){

        let table = this;

        this.grid = undefined
        this.data_function = data_function
        this.wrapper = wrapper
        this.columns = [
            {
                id: 'projectName',
                name: 'Name',
                sort: { compare: string_sort },
                attributes: {
                    className: "gridjs-th gridjs-td pointer gridjs-th-sort text-start"
                }
            }, {
                id: 'projectInstitutionName',
                name: 'Institution',
                sort: { compare: string_sort },
                attributes: {
                    className: "gridjs-th gridjs-td pointer gridjs-th-sort text-start"
                }
            }, {
                id: 'majorFieldOfScience',
                name: 'Field Of Science',
                attributes: {
                    className: "gridjs-th gridjs-td pointer gridjs-th-sort text-start"
                }
            }, {
                id: 'osdfFileTransferCount',
                name: 'Objects Transferred',
                data: (row) => Math.floor(row?.osdfFileTransferCount).toLocaleString(),
                sort: { compare: locale_int_string_sort },
                attributes: (cell, row, column) => {
                    if(cell !== null){
                        const data = table.data
                        const maxFileCount = Math.max(...Object.values(data).map(x => x.osdfFileTransferCount))
                        const cellValue = localeIntToInt(cell)
                        const colorValue = Math.min(1, 1 - Math.log(4 * (cellValue / maxFileCount) + 1))
                        const color = whiteorange(colorValue) // 1 - Math.log((cellValue / maxFileCount))
                        return {style: {backgroundColor: color}, className: "text-end"}
                    }
                }
            }, {
                id: 'osdfByteTransferCount',
                name: 'Bytes Transferred',
                sort: { compare: sortByteString },
                data: (row) => formatBytes(row.osdfByteTransferCount),
                attributes: (cell, row, column) => {
                    if(cell !== null){
                        const data = table.data
                        const maxByteCount = Math.max(...Object.values(data).map(x => x.osdfByteTransferCount))
                        const cellValue = byteStringToBytes(cell)
                        const colorValue = Math.min(1, 1 - Math.log(4 * (cellValue / maxByteCount) + 1))
                        const color = whiteorange(colorValue) // 1 - Math.log((cellValue / maxFileCount))
                        return {style: {backgroundColor: color}, className: "text-end"}
                    }
                }
            }
        ]
        this.grid =  new gridjs.Grid({
            columns: table.columns,
            sort: true,
            className: {
                container: "",
                table: "table table-hover",
                paginationButton: "mt-2 mt-sm-0"
            },
            data: async () => {
                table.data = await table.data_function()
                return Object.values(table.data).sort((a, b) => b.osdfFileTransferCount - a.osdfFileTransferCount)
            },
            pagination: {
                enabled: true,
                limit: 50
            },
            width: "100%",
            style: {
                td: {
                    'text-align': 'right'
                }
            }
        }).render(table.wrapper);
    }
    update = async () => {
        let table = this
        this.grid.updateConfig({
            data: Object.values(await table.data_function()).sort((a, b) => b.osdfFileTransferCount - a.osdfFileTransferCount)
        }).forceRender();
    }
}

class DataManager {
    constructor(filters, consumerToggles, errorNode) {
        this.filters = filters ? filters : {}
        this.consumerToggles = consumerToggles ? consumerToggles : []
        this.errorNode = errorNode ? errorNode : document.getElementById("error")
        this.error = undefined
    }

    toggleConsumers = () => {
        this.consumerToggles.forEach(f => f())
    }

    addFilter = (name, filter) => {
        this.filters[name] = filter
        this.toggleConsumers()
    }

    removeFilter = (name) => {
        delete this.filters[name]
        this.toggleConsumers()
    }

    getData = async () => {
        if(!this.data) {
            this.data = this._getData()
        }
        return this.data
    }

    set error(error){
        if(error){
            this.errorNode.textContent = error
            this.errorNode.style.display = "block"
        } else {
            this.errorNode.style.display = "none"
        }
    }

    _getData = async () => {

        let usageJson;
        try {
            usageJson = await UsageToggles.getUsage()
        } catch(e) {
            this.error = "Error fetching usage data, reloading page in 5 seconds."
            setTimeout(() => {window.location.reload()}, 5000)
        }

        this.data = usageJson

        return this.data
    }

    /**
     * Filters the original data and returns the remaining data
     * @returns {Promise<*>}
     */
    getFilteredData = async () => {
        let filteredData = await this.getData()
        for(const filter of Object.values(this.filters)) {
            filteredData = filter(filteredData)
        }
        return filteredData
    }

    reduceByKey = async (key, value) => {
        let data = await this.getFilteredData()
        let reducedData = Object.values(data).reduce((p, v) => {
            if(v[key] in p) {
                p[v[key]] += v[value]
            } else {
                p[v[key]] = v[value]
            }
            return p
        }, {})
        let sortedData = Object.entries(reducedData)
            .filter(([k,v]) => v > 0)
            .map(([k,v]) => {return {label: k, [value]: Math.round(v)}})
            .sort((a, b) => b[value] - a[value])
        return {
            labels: sortedData.map(x => x.label),
            data: sortedData.map(x => x[value])
        }
    }

}

class ProjectPage{
    constructor() {
        this.initialize()
    }

    /**
     * Initializes the project page objects
     *
     * Easier to do this all in an async environment so I can wait on data grabs
     * @returns {Promise<void>}
     */
    initialize = async () => {
        this.mode = undefined
        this.dataManager = new DataManager()

        this.wrapper = document.getElementById("wrapper")
        this.table = new Table(this.wrapper, this.dataManager.getFilteredData)
        this.dataManager.consumerToggles.push(this.table.update)

        this.search = new Search(Object.values(await this.dataManager.getData()), this.dataManager.toggleConsumers)
        this.dataManager.addFilter("search", this.search.filter)
        this.dataManager.addFilter("minimumFilesAndBytesFilter", this.minimumFilesAndBytesFilter)

        this.projectCount = new ProjectCount(this.dataManager.getFilteredData, document.getElementById("project-count"))
        this.projectCount.update()

        let urlProject = new URLSearchParams(window.location.search).get('project')
        if(urlProject) {
            this.projectDisplay.update((await this.dataManager.getData())[urlProject])
        }

        this.fosFilePieChart = new PieChart(
            "project-fos-file-summary",
            this.dataManager.reduceByKey.bind(this.dataManager, "majorFieldOfScience", "osdfFileTransferCount"),
            "# of Objects Transferred by Field Of Science"
        )
        this.fosBytePieChart = new PieChart(
            "project-fos-byte-summary",
            this.dataManager.reduceByKey.bind(this.dataManager, "majorFieldOfScience", "osdfByteTransferCount"),
            "# of Bytes Transferred by Field Of Science"
        )
        this.filePieChart = new PieChart(
            "project-file-summary",
            this.dataManager.reduceByKey.bind(this.dataManager, "projectName", "osdfFileTransferCount"),
            "# of Objects Transferred by Project"
        )
        this.bytePieChart = new PieChart(
            "project-byte-summary",
            this.dataManager.reduceByKey.bind(this.dataManager, "projectName", "osdfByteTransferCount"),
            "# of Bytes Transferred by Project"
        )

        this.dataManager.consumerToggles.push(this.fosFilePieChart.update)
        this.dataManager.consumerToggles.push(this.fosBytePieChart.update)
        this.dataManager.consumerToggles.push(this.filePieChart.update)
        this.dataManager.consumerToggles.push(this.bytePieChart.update)
    }

    minimumFilesAndBytesFilter = (data) => {
        return Object.entries(data).reduce((pv, [k,v]) => {
            if(v['osdfFileTransferCount'] > 0 && v['osdfByteTransferCount'] > 0){
                pv[k] = v
            }
            return pv
        }, {})
    }

    toggleActiveFilter = () => {
        if("minimumJobsFilter" in this.dataManager.filters){
            this.dataManager.removeFilter("minimumJobsFilter")
        } else {
            this.dataManager.addFilter("minimumJobsFilter", this.minimumJobsFilter)
        }
    }
}

const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl)
})

const project_page = new ProjectPage()

const populate_aggregate_statistics = async () => {
    const data = await project_page.dataManager.getFilteredData()
    document.getElementById("ospool-projects").textContent = Object.keys(data).length
    document.getElementById("ospool-osdf-files").textContent = Object.values(data).reduce((p, v) => p + v.osdfFileTransferCount, 0).toLocaleString()
    document.getElementById("ospool-osdf-bytes").textContent = formatBytes(Object.values(data).reduce((p, v) => p + v.osdfByteTransferCount, 0))
    document.getElementById("ospool-institutions").textContent = new Set(Object.values(data).map(v => v.projectInstitutionName)).size
    document.getElementById("ospool-fields-of-science").textContent = new Set(Object.values(data).map(v => v.majorFieldOfScience)).size
    document.getElementById("ospool-aggregate-text").hidden = false
}
populate_aggregate_statistics()