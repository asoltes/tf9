package graph

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type Action string

const (
	ActionNone    Action = ""
	ActionCreate  Action = "create"
	ActionUpdate  Action = "update"
	ActionDelete  Action = "delete"
	ActionReplace Action = "replace"
)

type Node struct {
	ID      string         `json:"id"`
	Kind    string         `json:"kind"`
	Label   string         `json:"label"`
	Address string         `json:"address,omitempty"`
	Parent  string         `json:"parent,omitempty"`
	Repo    string         `json:"repo,omitempty"`
	Group   string         `json:"group,omitempty"`
	Target  string         `json:"target,omitempty"`
	Action  Action         `json:"action,omitempty"`
	Changes []ChangeDetail `json:"changes,omitempty"`
	Command string         `json:"command,omitempty"`
	Result  string         `json:"result,omitempty"`
}

type ChangeDetail struct {
	Path        string `json:"path"`
	Kind        string `json:"kind"`
	Sensitive   bool   `json:"sensitive,omitempty"`
	Computed    bool   `json:"computed,omitempty"`
	Replacement bool   `json:"replacement,omitempty"`
}

type Edge struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Kind   string `json:"kind"`
}

type Document struct {
	RunID     string    `json:"runId"`
	Repo      string    `json:"repo"`
	Revision  int       `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
	Nodes     []Node    `json:"nodes"`
	Edges     []Edge    `json:"edges"`
	Errors    []string  `json:"errors,omitempty"`
}

type TargetGraph struct {
	Nodes []Node
	Edges []Edge
}

type planJSON struct {
	Values struct {
		RootModule *plannedModule `json:"root_module"`
	} `json:"values"`
	PlannedValues struct {
		RootModule *plannedModule `json:"root_module"`
	} `json:"planned_values"`
	Configuration struct {
		RootModule *configModule `json:"root_module"`
	} `json:"configuration"`
	ResourceChanges []struct {
		Address string `json:"address"`
		Mode    string `json:"mode"`
		Change  struct {
			Actions         []string `json:"actions"`
			Before          any      `json:"before"`
			After           any      `json:"after"`
			BeforeSensitive any      `json:"before_sensitive"`
			AfterSensitive  any      `json:"after_sensitive"`
			AfterUnknown    any      `json:"after_unknown"`
			ReplacePaths    [][]any  `json:"replace_paths"`
		} `json:"change"`
	} `json:"resource_changes"`
}

type plannedModule struct {
	Address      string            `json:"address"`
	Resources    []plannedResource `json:"resources"`
	ChildModules []plannedModule   `json:"child_modules"`
}

type plannedResource struct {
	Address   string   `json:"address"`
	Mode      string   `json:"mode"`
	Type      string   `json:"type"`
	Name      string   `json:"name"`
	DependsOn []string `json:"depends_on"`
}

type configModule struct {
	Resources   []configResource `json:"resources"`
	ModuleCalls map[string]struct {
		Module *configModule `json:"module"`
	} `json:"module_calls"`
}

type configResource struct {
	Address     string                     `json:"address"`
	Mode        string                     `json:"mode"`
	Expressions map[string]json.RawMessage `json:"expressions"`
	DependsOn   []string                   `json:"depends_on"`
}

func Extract(planFile, dir, repo, group, target, command, planOutput string, env []string) (TargetGraph, error) {
	args := []string{"show", "-json"}
	if planFile != "" {
		args = append(args, planFile)
	}
	cmd := exec.Command("terraform", args...)
	cmd.Dir = dir
	if env != nil {
		cmd.Env = env
	}
	out, err := cmd.Output()
	if err != nil {
		return TargetGraph{}, fmt.Errorf("terraform show -json: %w", err)
	}
	return extractJSON(out, repo, group, target, command, planOutput)
}

func extractJSON(out []byte, repo, group, target, command, terraformOutput string) (TargetGraph, error) {
	var plan planJSON
	if err := json.Unmarshal(out, &plan); err != nil {
		return TargetGraph{}, fmt.Errorf("parse terraform JSON: %w", err)
	}

	actions := make(map[string]Action)
	changeDetails := make(map[string][]ChangeDetail)
	resultBlocks, resultActions := resourceResultBlocks(terraformOutput)
	for _, change := range plan.ResourceChanges {
		if change.Mode == "managed" {
			actions[change.Address] = planAction(change.Change.Actions)
			changeDetails[change.Address] = summarizeChanges(
				change.Change.Before,
				change.Change.After,
				change.Change.BeforeSensitive,
				change.Change.AfterSensitive,
				change.Change.AfterUnknown,
				change.Change.ReplacePaths,
			)
		}
	}
	for address, action := range resultActions {
		actions[address] = action
	}

	prefix := "target:" + target + ":"
	nodes := make(map[string]Node)
	resourceIDs := make(map[string]string)
	stateDependencies := make(map[string][]string)
	addModule := func(address string) string {
		id := prefix + "module:" + address
		if _, ok := nodes[id]; !ok {
			label := "root"
			parent := prefix + "root"
			if address != "" {
				parts := strings.Split(address, ".")
				label = strings.Join(parts[max(0, len(parts)-2):], ".")
				parent = prefix + "module:" + parentModule(address)
				if parentModule(address) == "" {
					parent = prefix + "root"
				}
			}
			nodes[id] = Node{ID: id, Kind: "module", Label: label, Address: address, Parent: parent, Repo: repo, Group: group, Target: target}
		}
		return id
	}

	var walkPlanned func(*plannedModule)
	walkPlanned = func(module *plannedModule) {
		if module == nil {
			return
		}
		moduleID := addModule(module.Address)
		for _, resource := range module.Resources {
			if resource.Mode != "managed" && resource.Mode != "data" {
				continue
			}
			id := prefix + "resource:" + resource.Address
			resourceIDs[resource.Address] = id
			action := ActionNone
			if resource.Mode == "managed" {
				action = actions[resource.Address]
			}
			nodes[id] = Node{
				ID: id, Kind: resource.Mode, Label: resource.Type + "." + resource.Name,
				Address: resource.Address, Parent: moduleID, Repo: repo, Group: group,
				Target: target, Action: action, Changes: changeDetails[resource.Address],
				Command: command, Result: resultBlocks[resource.Address],
			}
			for _, dependency := range resource.DependsOn {
				// State JSON exposes explicit dependencies directly. Resolve the
				// edges after all resources have been visited.
				stateDependencies[resource.Address] = append(stateDependencies[resource.Address], dependency)
			}
		}
		for i := range module.ChildModules {
			walkPlanned(&module.ChildModules[i])
		}
	}
	rootModule := plan.PlannedValues.RootModule
	if rootModule == nil {
		rootModule = plan.Values.RootModule
	}
	walkPlanned(rootModule)

	// Deleted resources can be absent from planned_values, so add them from changes.
	for address, action := range actions {
		if _, ok := resourceIDs[address]; ok {
			continue
		}
		moduleAddr := moduleAddress(address)
		moduleID := addModule(moduleAddr)
		id := prefix + "resource:" + address
		resourceIDs[address] = id
		nodes[id] = Node{
			ID: id, Kind: "managed", Label: resourceLabel(address), Address: address,
			Parent: moduleID, Repo: repo, Group: group, Target: target, Action: action,
			Changes: changeDetails[address], Command: command, Result: resultBlocks[address],
		}
	}

	// Group every concrete instance node by its base (index-stripped) address,
	// sorted, so references to count/for_each resources — which appear in the
	// configuration as the bare base address — expand to real instance edges.
	instancesByBase := make(map[string][]string)
	{
		type inst struct{ addr, id string }
		grouped := make(map[string][]inst)
		for addr, id := range resourceIDs {
			base := baseAddress(addr)
			grouped[base] = append(grouped[base], inst{addr, id})
		}
		for base, list := range grouped {
			sort.Slice(list, func(i, j int) bool { return list[i].addr < list[j].addr })
			ids := make([]string, len(list))
			for i, it := range list {
				ids[i] = it.id
			}
			instancesByBase[base] = ids
		}
	}
	resolve := func(addr string) []string {
		if id, ok := resourceIDs[addr]; ok {
			return []string{id}
		}
		return instancesByBase[addr]
	}

	edgeSet := make(map[string]Edge)
	// addEdges links each dependent instance to one prerequisite instance,
	// pairing by position and cycling the shorter side. This reproduces
	// count.index-style fan-out without an instance×instance explosion.
	addEdges := func(dependents, prerequisites []string) {
		if len(dependents) == 0 || len(prerequisites) == 0 {
			return
		}
		for i, dependentID := range dependents {
			prereqID := prerequisites[i%len(prerequisites)]
			if dependentID == prereqID {
				continue
			}
			id := "dependency:" + prereqID + "->" + dependentID
			edgeSet[id] = Edge{ID: id, Source: prereqID, Target: dependentID, Kind: "dependency"}
		}
	}
	for sourceAddr, dependencies := range stateDependencies {
		dependents := resolve(sourceAddr)
		for _, dependency := range dependencies {
			addEdges(dependents, resolve(normalizeReference(dependency)))
		}
	}
	var walkConfig func(*configModule, string)
	walkConfig = func(module *configModule, moduleAddr string) {
		if module == nil {
			return
		}
		for _, resource := range module.Resources {
			dependents := resolve(qualifyAddress(moduleAddr, resource.Address))
			if len(dependents) == 0 {
				continue
			}
			for _, raw := range resource.Expressions {
				for _, ref := range expressionReferences(raw) {
					addEdges(dependents, resolve(qualifyAddress(moduleAddr, normalizeReference(ref))))
				}
			}
			for _, ref := range resource.DependsOn {
				addEdges(dependents, resolve(qualifyAddress(moduleAddr, normalizeReference(ref))))
			}
		}
		for name, call := range module.ModuleCalls {
			childAddr := "module." + name
			if moduleAddr != "" {
				childAddr = moduleAddr + "." + childAddr
			}
			walkConfig(call.Module, childAddr)
		}
	}
	walkConfig(plan.Configuration.RootModule, "")

	outNodes := make([]Node, 0, len(nodes))
	for _, node := range nodes {
		outNodes = append(outNodes, node)
	}
	sort.Slice(outNodes, func(i, j int) bool { return outNodes[i].ID < outNodes[j].ID })
	outEdges := make([]Edge, 0, len(edgeSet))
	for _, edge := range edgeSet {
		outEdges = append(outEdges, edge)
	}
	sort.Slice(outEdges, func(i, j int) bool { return outEdges[i].ID < outEdges[j].ID })
	return TargetGraph{Nodes: outNodes, Edges: outEdges}, nil
}

func resourceResultBlocks(output string) (map[string]string, map[string]Action) {
	clean := stripANSI(output)
	lines := strings.Split(clean, "\n")
	blocks := make(map[string]string)
	actions := make(map[string]Action)
	for i := 0; i < len(lines); i++ {
		trimmed := strings.TrimSpace(lines[i])
		if !strings.HasPrefix(trimmed, "# ") {
			continue
		}
		fields := strings.Fields(strings.TrimPrefix(trimmed, "# "))
		if len(fields) < 2 {
			continue
		}
		address := fields[0]
		if !strings.Contains(address, ".") {
			continue
		}
		end := i + 1
		for end < len(lines) {
			next := strings.TrimSpace(lines[end])
			if end > i+1 && (strings.HasPrefix(next, "# ") || strings.HasPrefix(next, "Plan:") || strings.HasPrefix(next, "Changes to Outputs:")) {
				break
			}
			end++
		}
		block := strings.TrimSpace(strings.Join(lines[i:end], "\n"))
		if block != "" {
			blocks[address] = block
			actions[address] = resultAction(trimmed)
		}
		i = end - 1
	}
	return blocks, actions
}

func resultAction(header string) Action {
	switch {
	case strings.Contains(header, "will be created"):
		return ActionCreate
	case strings.Contains(header, "will be updated in-place"):
		return ActionUpdate
	case strings.Contains(header, "will be destroyed"):
		return ActionDelete
	case strings.Contains(header, "must be replaced"), strings.Contains(header, "will be replaced"):
		return ActionReplace
	default:
		return ActionNone
	}
}

func stripANSI(value string) string {
	var out strings.Builder
	for i := 0; i < len(value); {
		if value[i] == 0x1b && i+1 < len(value) && value[i+1] == '[' {
			i += 2
			for i < len(value) {
				ch := value[i]
				i++
				if (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') {
					break
				}
			}
			continue
		}
		out.WriteByte(value[i])
		i++
	}
	return out.String()
}

func SaveTarget(path, runID, repo, group, target string, targetGraph TargetGraph) error {
	doc := Document{RunID: runID, Repo: repo}
	if data, err := os.ReadFile(path); err == nil {
		if err := json.Unmarshal(data, &doc); err != nil {
			return fmt.Errorf("parse existing graph: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read graph: %w", err)
	}

	targetPrefix := "target:" + target + ":"
	filteredNodes := doc.Nodes[:0]
	for _, node := range doc.Nodes {
		if !strings.HasPrefix(node.ID, targetPrefix) {
			filteredNodes = append(filteredNodes, node)
		}
	}
	doc.Nodes = append(filteredNodes, targetGraph.Nodes...)
	filteredEdges := doc.Edges[:0]
	for _, edge := range doc.Edges {
		if !strings.Contains(edge.Source, targetPrefix) && !strings.Contains(edge.Target, targetPrefix) {
			filteredEdges = append(filteredEdges, edge)
		}
	}
	doc.Edges = append(filteredEdges, targetGraph.Edges...)
	if doc.Nodes == nil {
		doc.Nodes = []Node{}
	}
	if doc.Edges == nil {
		doc.Edges = []Edge{}
	}
	doc.Revision++
	doc.UpdatedAt = time.Now().UTC()

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create graph directory: %w", err)
	}
	data, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("marshal graph: %w", err)
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write graph: %w", err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("replace graph: %w", err)
	}
	return nil
}

func planAction(actions []string) Action {
	hasCreate, hasDelete, hasUpdate := false, false, false
	for _, action := range actions {
		switch action {
		case "create":
			hasCreate = true
		case "delete":
			hasDelete = true
		case "update":
			hasUpdate = true
		}
	}
	if hasCreate && hasDelete {
		return ActionReplace
	}
	if hasCreate {
		return ActionCreate
	}
	if hasDelete {
		return ActionDelete
	}
	if hasUpdate {
		return ActionUpdate
	}
	return ActionNone
}

const maxChangeDetails = 50

func summarizeChanges(before, after, beforeSensitive, afterSensitive, afterUnknown any, replacePaths [][]any) []ChangeDetail {
	replacements := make(map[string]bool)
	for _, path := range replacePaths {
		replacements[pathString(path)] = true
	}
	var details []ChangeDetail
	diffValues("", before, after, beforeSensitive, afterSensitive, afterUnknown, replacements, &details)
	sort.Slice(details, func(i, j int) bool { return details[i].Path < details[j].Path })
	if len(details) > maxChangeDetails {
		details = details[:maxChangeDetails]
	}
	return details
}

func diffValues(path string, before, after, beforeSensitive, afterSensitive, afterUnknown any, replacements map[string]bool, out *[]ChangeDetail) {
	if len(*out) >= maxChangeDetails {
		return
	}
	beforeMap, beforeIsMap := before.(map[string]any)
	afterMap, afterIsMap := after.(map[string]any)
	if beforeIsMap || afterIsMap {
		keys := make(map[string]bool)
		for key := range beforeMap {
			keys[key] = true
		}
		for key := range afterMap {
			keys[key] = true
		}
		names := make([]string, 0, len(keys))
		for key := range keys {
			names = append(names, key)
		}
		sort.Strings(names)
		for _, key := range names {
			childPath := joinPath(path, key)
			diffValues(
				childPath,
				beforeMap[key],
				afterMap[key],
				childValue(beforeSensitive, key),
				childValue(afterSensitive, key),
				childValue(afterUnknown, key),
				replacements,
				out,
			)
		}
		return
	}

	beforeSlice, beforeIsSlice := before.([]any)
	afterSlice, afterIsSlice := after.([]any)
	if beforeIsSlice || afterIsSlice {
		maxLen := len(beforeSlice)
		if len(afterSlice) > maxLen {
			maxLen = len(afterSlice)
		}
		for i := 0; i < maxLen && len(*out) < maxChangeDetails; i++ {
			childPath := fmt.Sprintf("%s[%d]", path, i)
			diffValues(
				childPath,
				sliceValue(beforeSlice, i),
				sliceValue(afterSlice, i),
				sliceValueAny(beforeSensitive, i),
				sliceValueAny(afterSensitive, i),
				sliceValueAny(afterUnknown, i),
				replacements,
				out,
			)
		}
		return
	}

	if valuesEqual(before, after) && !truthy(afterUnknown) {
		return
	}
	kind := "updated"
	if before == nil && after != nil {
		kind = "added"
	} else if before != nil && after == nil {
		kind = "removed"
	}
	if path == "" {
		path = "(resource)"
	}
	*out = append(*out, ChangeDetail{
		Path:        path,
		Kind:        kind,
		Sensitive:   truthy(beforeSensitive) || truthy(afterSensitive),
		Computed:    truthy(afterUnknown),
		Replacement: replacements[path],
	})
}

func valuesEqual(a, b any) bool {
	aj, errA := json.Marshal(a)
	bj, errB := json.Marshal(b)
	return errA == nil && errB == nil && string(aj) == string(bj)
}

func childValue(value any, key string) any {
	if m, ok := value.(map[string]any); ok {
		return m[key]
	}
	if truthy(value) {
		return true
	}
	return nil
}

func sliceValue(values []any, index int) any {
	if index >= 0 && index < len(values) {
		return values[index]
	}
	return nil
}

func sliceValueAny(value any, index int) any {
	if values, ok := value.([]any); ok {
		return sliceValue(values, index)
	}
	if truthy(value) {
		return true
	}
	return nil
}

func truthy(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case map[string]any:
		for _, child := range v {
			if truthy(child) {
				return true
			}
		}
	case []any:
		for _, child := range v {
			if truthy(child) {
				return true
			}
		}
	}
	return false
}

func joinPath(parent, child string) string {
	if parent == "" {
		return child
	}
	return parent + "." + child
}

func pathString(parts []any) string {
	var path string
	for _, part := range parts {
		switch value := part.(type) {
		case string:
			path = joinPath(path, value)
		case float64:
			path += fmt.Sprintf("[%d]", int(value))
		}
	}
	return path
}

func expressionReferences(raw json.RawMessage) []string {
	var value any
	if json.Unmarshal(raw, &value) != nil {
		return nil
	}
	var refs []string
	var walk func(any)
	walk = func(v any) {
		switch x := v.(type) {
		case map[string]any:
			if rs, ok := x["references"].([]any); ok {
				for _, ref := range rs {
					if s, ok := ref.(string); ok {
						refs = append(refs, s)
					}
				}
			}
			for _, child := range x {
				walk(child)
			}
		case []any:
			for _, child := range x {
				walk(child)
			}
		}
	}
	walk(value)
	return refs
}

func normalizeReference(ref string) string {
	parts := strings.Split(ref, ".")
	for len(parts) > 2 {
		last := parts[len(parts)-1]
		if strings.HasPrefix(last, "[") || last == "id" || last == "arn" || last == "name" || last == "output" {
			parts = parts[:len(parts)-1]
			continue
		}
		break
	}
	return strings.Join(parts, ".")
}

// baseAddress strips a trailing instance key (count index or for_each key) from
// a resource address: terraform_data.svc[3] -> terraform_data.svc.
func baseAddress(address string) string {
	if strings.HasSuffix(address, "]") {
		if i := strings.LastIndex(address, "["); i >= 0 {
			return address[:i]
		}
	}
	return address
}

func moduleAddress(address string) string {
	parts := strings.Split(address, ".")
	var modules []string
	for i := 0; i+1 < len(parts) && parts[i] == "module"; i += 2 {
		modules = append(modules, parts[i], parts[i+1])
	}
	return strings.Join(modules, ".")
}

func parentModule(address string) string {
	parts := strings.Split(address, ".")
	if len(parts) <= 2 {
		return ""
	}
	return strings.Join(parts[:len(parts)-2], ".")
}

func qualifyAddress(moduleAddr, address string) string {
	if moduleAddr == "" || strings.HasPrefix(address, "module.") {
		return address
	}
	return moduleAddr + "." + address
}

func resourceLabel(address string) string {
	parts := strings.Split(address, ".")
	if len(parts) >= 2 {
		return strings.Join(parts[len(parts)-2:], ".")
	}
	return address
}
